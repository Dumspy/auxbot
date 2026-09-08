# Discord Reminders (Slack-style)

Recurring and one-time reminders delivered as DMs to self or posts in a channel, with natural-language scheduling.

## Overview

A `/remind` command group modelled on Slack's `/remind`:

- `/remind create` — schedule a one-time, daily, or weekly reminder
- `/remind list` — show your upcoming reminders (and failures)
- `/remind delete` — remove a reminder by ID

The controller owns scheduling. Redis is the store + due-queue so reminders survive restarts and stay correct when the controller later scales to multiple replicas. Redis itself is operator-provided (not deployed by this repo); the controller only expects connection config via env.

## Requirements

### Functional Requirements

- Users can create a **one-time**, **daily**, or **weekly** reminder via `/remind create`
- `when` accepts natural language: `tomorrow at 9am`, `monday 10:00`, `in 2h`, `2026-09-20 09:00`
- `repeat` is one of `never` (one-time), `daily`, `weekly`
- `target` is one of `me` (bot DMs the creator) or `here` (bot posts in the channel where created)
- `timezone` is optional per-reminder, defaults to `Europe/Copenhagen` (env-overridable)
- `message` is free-form text, mentions/formatting preserved (`<@id>`, `<#id>`, `@here` where permitted)
- `/remind list` shows the caller's reminders: message preview, target, repeat, next fire time (with timezone), status (`scheduled` / `failed`)
- `/remind delete id:` removes a reminder owned by the caller
- **Permissions:**
  - `target: me` — everyone may create
  - `target: here` — only user IDs in `CHANNEL_REMINDER_USER_IDS` may create; others get an ephemeral denial
  - `list`/`delete` only ever operate on the caller's own reminders
- **Missed fires (downtime):** if a fire time passes while bot/Redis is down, send ASAP on recovery with a delay indicator, e.g. `⏰ (delayed 2h13m by downtime)` prepended to the message. No silent drops, no skips.
- **DM failure:** if the creator's DMs are closed/blocked, mark that fire `failed`, keep the schedule (recurring continues), surface `failed` status in `/remind list`
- Channel posts ping nobody by default — the message body is exactly what the creator wrote, so they control mentions

### Non-Functional Requirements

- Scale: tens of reminders; poller interval 15s, batch ≤ 50 per tick is plenty
- Multi-replica-safe claiming from day one (atomic Lua claim), even though prod is 1 replica today
- Delivery: at-least-once per fire (claim-then-send; a crash between claim and send may resend on next tick — acceptable, documented)
- Observability: Sentry on scheduler/delivery errors with `reminderId`, `guildId`, `target`
- Type safety: strict TS, zod validation on command input where discord.js types leave gaps
- Security: Redis URL via env, never logged; mention spam bounded by channel-post allowlist

## Architecture

### Component Structure

```
apps/controller/src/
├── commands/
│   └── remind.ts            # /remind create|list|delete handlers
├── services/
│   ├── redis.ts             # shared ioredis client (REDIS_URL)
│   └── reminders.ts         # CRUD + due-claim + reschedule logic
├── utils/
│   └── schedule.ts          # chrono + luxon parsing, next-fire computation
└── jobs/
    └── reminder-poller.ts   # setInterval loop started in boot()
```

### Data Flow

1. User runs `/remind create` → validate perms (`here` ⇒ allowlist) → parse `when` in `timezone` → compute first `nextFireAt` → `HSET remind:<id>` + `ZADD remind:due <ts> <id>` + `SADD remind:by_user:<uid> <id>`
2. Poller ticks every 15s → Lua script pops up to N IDs with score ≤ now (atomic `ZRANGEBYSCORE` + `ZREM`) → for each: fetch hash, deliver, then reschedule or cleanup
3. Deliver `me` → `client.users.fetch(creatorId)` → `user.send(message)`; on 50007 (DMs closed) mark `failed`
4. Deliver `here` → `client.channels.fetch(channelId)` → text-channel `send(message)`; on missing perms mark `failed`
5. After fire: `repeat=never` → delete all keys; `daily`/`weekly` → recompute next future `nextFireAt` in reminder timezone, `ZADD` back (loop forward while ≤ now so long downtimes land on the next valid slot, then flag `delayed` on the catch-up send)
6. `/remind list` → `SMEMBERS remind:by_user:<uid>` → `HMGET` each → ephemeral reply. `/remind delete` → verify owner → `DEL` + `ZREM` + `SREM`

### Redis Schema

- `remind:<id>` HASH: `id, guildId|null (null for DM-created?), channelId, creatorId, message, timezone, repeat, nextFireAt (ms epoch), status (scheduled|failed), failureReason?, createdAt`
- `remind:due` ZSET: member `<id>`, score `nextFireAt`
- `remind:by_user:<userId>` SET: `<id>`s (for list; cleaned on delete/fire-once)

IDs: `crypto.randomUUID()`. All writes for create/delete use a pipeline (hash+zset+set) — no strict transaction needed at this scale.

### Claim Script (Lua, atomic)

```lua
local due = redis.call('ZRANGEBYSCORE', KEYS[1], 0, ARGV[1], 'LIMIT', 0, tonumber(ARGV[2]))
if #due > 0 then redis.call('ZREM', KEYS[1], unpack(due)) end
return due
```

Only the claiming replica processes returned IDs → safe with N replicas, no Redlock needed.

## API Design

### Discord Slash Commands

**`/remind create`** options:

- `message` (string, required, ≤ 1500 chars): full custom body, mentions preserved
- `when` (string, required): natural language, e.g. `tomorrow at 9am`, `mon 10:00`, `in 30m`
- `repeat` (string, optional, default `never`): `never` | `daily` | `weekly`
- `target` (string, optional, default `me`): `me` | `here`
- `timezone` (string, optional, default `$DEFAULT_TIMEZONE`): IANA name, e.g. `Europe/Copenhagen`

**`/remind list`** — no options, ephemeral reply with one line per reminder:
`• <id-short> — "msg preview…" — #channel|DM — daily 09:00 Europe/Copenhagen — next <t:ts:F> — scheduled`

**`/remind delete`** options: `id` (string, required, full UUID — list shows an 8-char hint but delete takes the full ID; alternatively a choice list when ≤ 25 reminders)

### Delivery Format

- On-time channel/DM: message body verbatim
- Late (was due while down): `⏰ Delayed <duration> (was due <t:ts:F>):\n<message>`
- Use `allowedMentions` = parse all (creator controls mentions; channel creation is allowlisted). Document that `@everyone`/`@here` obey the author's channel perms at send time.

## Scheduling / Time Handling

`utils/schedule.ts`:

- Parse: `chrono.parse(when, refDate, { forwardDate: true })` where `refDate` = now in target zone; take first result's start (hour/minute + date/weekday)
- Anchor: rebuild as Luxon `DateTime` in `timezone` so `daily`/`weekly` repeats are wall-clock correct across DST
- `weekly` keeps the original weekday; `daily` keeps wall time
- If parsed time is in the past and `repeat=never` → reject with "that time is in the past"; if recurring → roll forward to next future slot
- Validate `timezone` via `Intl.supportedValuesOf('timeZone')` / Luxon `isValid`; reject unknown zones
- New packages: `chrono-node`, `luxon`, `ioredis` (all in controller only)

## Error Handling

- Unparseable `when` → ephemeral: `I couldn't understand "…". Try "tomorrow at 9am" or "monday 10:00".`
- Past one-time → ephemeral: `That time is already past.`
- Non-allowlisted `here` → ephemeral: `Only approved users can post channel reminders.`
- Bot lacks channel send perms at fire → mark `failed`, reason in hash, visible in list
- Redis down at create → ephemeral `Reminders are temporarily unavailable.` + Sentry
- Redis down during poll → log + Sentry, retry next tick (nothing claimed, nothing lost)

## Security Considerations

- `CHANNEL_REMINDER_USER_IDS` comma-separated allowlist gates `target:here`
- `message` length-capped; stored verbatim in Redis (operator-owned); no cross-user reads (list/delete scoped by creator)
- `REDIS_URL` from env, never logged or echoed

## Performance Considerations

- Poll every 15s, `LIMIT 50` — trivial for tens of reminders
- `list` fans out `HGETALL` per ID; fine at this scale (cap displayed at 25, note count beyond)

## Testing (manual, no framework in repo)

1. One-time DM: `/remind create message:hi when:"in 1 minute" target:me` → DM arrives ~on time
2. Daily channel (allowlisted): `when:"in 1 minute" repeat:daily target:here` → posts, `list` shows tomorrow's fire
3. Non-allowlisted `here` → ephemeral denial
4. Restart controller with pending reminder → fires on recovery with `⏰ Delayed…` prefix
5. Blocked DMs → `failed` in list, recurring keeps schedule
6. Bad `when` / past time / bad timezone → clean ephemeral errors
7. Two controller replicas locally → each fire delivered once

## Dependencies / Env

### Packages (controller only)

- `ioredis`, `chrono-node`, `luxon` (+ `@types/luxon` if needed)

### Environment Variables

- `REDIS_URL` (required) — e.g. `redis://redis:6379`; operator provisions Redis
- `CHANNEL_REMINDER_USER_IDS` (required, comma-separated Discord user IDs)
- `DEFAULT_TIMEZONE` (default `Europe/Copenhagen`)

## Out of Scope / Future

- `weekdays` repeat, custom cron, snooze, edit, `@everyone` approval flows
- Thread targets, per-guild default timezones, guild-admin management UI
- Recurring end-dates / occurrence caps
