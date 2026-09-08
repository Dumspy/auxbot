import { randomUUID } from "node:crypto";
import { getRedis } from "./redis.js";
import { nextAfterFire, type Repeat } from "../utils/schedule.js";

export type ReminderTarget = "me" | "here";
export type ReminderStatus = "scheduled" | "failed";

export interface Reminder {
  id: string;
  guildId: string | null;
  channelId: string | null;
  creatorId: string;
  message: string;
  timezone: string;
  repeat: Repeat;
  target: ReminderTarget;
  nextFireAt: number;
  status: ReminderStatus;
  failureReason: string | null;
  createdAt: number;
}

export interface CreateReminderInput {
  guildId: string | null;
  channelId: string | null;
  creatorId: string;
  message: string;
  timezone: string;
  repeat: Repeat;
  target: ReminderTarget;
  nextFireAt: number;
}

const DUE_KEY = "remind:due";

function reminderKey(id: string): string {
  return `remind:${id}`;
}

function userKey(userId: string): string {
  return `remind:by_user:${userId}`;
}

function toHash(reminder: Reminder): Record<string, string> {
  return {
    id: reminder.id,
    guildId: reminder.guildId ?? "",
    channelId: reminder.channelId ?? "",
    creatorId: reminder.creatorId,
    message: reminder.message,
    timezone: reminder.timezone,
    repeat: reminder.repeat,
    target: reminder.target,
    nextFireAt: String(reminder.nextFireAt),
    status: reminder.status,
    failureReason: reminder.failureReason ?? "",
    createdAt: String(reminder.createdAt),
  };
}

function fromHash(hash: Record<string, string>): Reminder | null {
  const id = hash["id"];
  const creatorId = hash["creatorId"];
  const message = hash["message"];
  const timezone = hash["timezone"];
  const nextFireAt = Number(hash["nextFireAt"]);
  const createdAt = Number(hash["createdAt"]);

  if (!id || !creatorId || !message || !timezone || !isFinite(nextFireAt) || !isFinite(createdAt)) {
    return null;
  }

  const repeat = hash["repeat"];
  const target = hash["target"];
  const status = hash["status"];

  if (repeat !== "never" && repeat !== "daily" && repeat !== "weekly") {
    return null;
  }

  if (target !== "me" && target !== "here") {
    return null;
  }

  if (status !== "scheduled" && status !== "failed") {
    return null;
  }

  return {
    id,
    guildId: hash["guildId"] ? hash["guildId"] : null,
    channelId: hash["channelId"] ? hash["channelId"] : null,
    creatorId,
    message,
    timezone,
    repeat,
    target,
    nextFireAt,
    status,
    failureReason: hash["failureReason"] ? hash["failureReason"] : null,
    createdAt,
  };
}

export async function createReminder(input: CreateReminderInput): Promise<Reminder> {
  const reminder: Reminder = {
    id: randomUUID(),
    guildId: input.guildId,
    channelId: input.channelId,
    creatorId: input.creatorId,
    message: input.message,
    timezone: input.timezone,
    repeat: input.repeat,
    target: input.target,
    nextFireAt: input.nextFireAt,
    status: "scheduled",
    failureReason: null,
    createdAt: Date.now(),
  };

  const redis = getRedis();
  const pipeline = redis.pipeline();
  pipeline.hset(reminderKey(reminder.id), toHash(reminder));
  pipeline.zadd(DUE_KEY, reminder.nextFireAt, reminder.id);
  pipeline.sadd(userKey(reminder.creatorId), reminder.id);
  await pipeline.exec();

  return reminder;
}

export async function getReminder(id: string): Promise<Reminder | null> {
  const hash = await getRedis().hgetall(reminderKey(id));

  if (Object.keys(hash).length === 0) {
    return null;
  }

  return fromHash(hash);
}

export async function listReminders(userId: string): Promise<Reminder[]> {
  const redis = getRedis();
  const ids = await redis.smembers(userKey(userId));

  if (ids.length === 0) {
    return [];
  }

  const pipeline = redis.pipeline();
  for (const id of ids) {
    pipeline.hgetall(reminderKey(id));
  }

  const results = await pipeline.exec();
  const reminders: Reminder[] = [];

  if (results) {
    for (const [error, hash] of results) {
      if (error) {
        continue;
      }

      const reminder = fromHash(hash as Record<string, string>);

      if (reminder) {
        reminders.push(reminder);
      }
    }
  }

  reminders.sort((a, b) => a.nextFireAt - b.nextFireAt);
  return reminders;
}

export async function deleteReminder(userId: string, id: string): Promise<boolean> {
  const existing = await getReminder(id);

  if (!existing || existing.creatorId !== userId) {
    return false;
  }

  const pipeline = getRedis().pipeline();
  pipeline.del(reminderKey(id));
  pipeline.zrem(DUE_KEY, id);
  pipeline.srem(userKey(userId), id);
  await pipeline.exec();

  return true;
}

const CLAIM_SCRIPT = `
local due = redis.call('ZRANGEBYSCORE', KEYS[1], 0, ARGV[1], 'LIMIT', 0, tonumber(ARGV[2]))
if #due > 0 then redis.call('ZREM', KEYS[1], unpack(due)) end
return due
`;

export async function claimDueIds(nowMs: number, batchSize: number): Promise<string[]> {
  const result = await getRedis().eval(CLAIM_SCRIPT, 1, DUE_KEY, String(nowMs), String(batchSize));

  if (!Array.isArray(result)) {
    return [];
  }

  return result.filter((id): id is string => typeof id === "string");
}

export async function markFailed(id: string, reason: string): Promise<void> {
  const redis = getRedis();
  const pipeline = redis.pipeline();
  pipeline.hset(reminderKey(id), { status: "failed", failureReason: reason });
  await pipeline.exec();
}

export async function markFailedAndReschedule(
  reminder: Reminder,
  reason: string,
  nowMs: number,
): Promise<void> {
  if (reminder.repeat === "never") {
    await markFailed(reminder.id, reason);
    return;
  }

  const next = nextAfterFire(reminder.nextFireAt, reminder.repeat, reminder.timezone, nowMs);

  if (next === null) {
    await markFailed(reminder.id, reason);
    return;
  }

  const redis = getRedis();
  const pipeline = redis.pipeline();
  pipeline.hset(reminderKey(reminder.id), {
    nextFireAt: String(next),
    status: "failed",
    failureReason: reason,
  });
  pipeline.zadd(DUE_KEY, next, reminder.id);
  await pipeline.exec();
}

export async function settleAfterFire(
  reminder: Reminder,
  nowMs: number,
): Promise<"deleted" | "rescheduled"> {
  const redis = getRedis();

  if (reminder.repeat === "never") {
    const pipeline = redis.pipeline();
    pipeline.del(reminderKey(reminder.id));
    pipeline.zrem(DUE_KEY, reminder.id);
    pipeline.srem(userKey(reminder.creatorId), reminder.id);
    await pipeline.exec();
    return "deleted";
  }

  const next = nextAfterFire(reminder.nextFireAt, reminder.repeat, reminder.timezone, nowMs);

  if (next === null) {
    const pipeline = redis.pipeline();
    pipeline.del(reminderKey(reminder.id));
    pipeline.zrem(DUE_KEY, reminder.id);
    pipeline.srem(userKey(reminder.creatorId), reminder.id);
    await pipeline.exec();
    return "deleted";
  }

  const pipeline = redis.pipeline();
  pipeline.hset(reminderKey(reminder.id), {
    nextFireAt: String(next),
    status: "scheduled",
    failureReason: "",
  });
  pipeline.zadd(DUE_KEY, next, reminder.id);
  await pipeline.exec();
  return "rescheduled";
}
