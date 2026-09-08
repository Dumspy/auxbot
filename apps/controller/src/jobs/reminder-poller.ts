import { captureException } from "@auxbot/sentry";
import type { Client } from "discord.js";
import {
  claimDueIds,
  getReminder,
  markFailedAndReschedule,
  settleAfterFire,
  type Reminder,
} from "../services/reminders.js";
import { formatDelay } from "../utils/schedule.js";

const POLL_INTERVAL_MS = 15000;
const CLAIM_BATCH_SIZE = 50;
const LATE_THRESHOLD_MS = 60000;

function buildContent(reminder: Reminder, nowMs: number): string {
  const delayMs = nowMs - reminder.nextFireAt;

  if (delayMs <= LATE_THRESHOLD_MS) {
    return reminder.message;
  }

  const dueSeconds = Math.floor(reminder.nextFireAt / 1000);
  return `⏰ Delayed ${formatDelay(delayMs)} (was due <t:${dueSeconds}:F>):\n${reminder.message}`;
}

async function deliver(client: Client, reminder: Reminder, content: string): Promise<void> {
  if (reminder.target === "me") {
    const user = await client.users.fetch(reminder.creatorId);
    await user.send({ content, allowedMentions: { parse: ["users"] } });
    return;
  }

  if (!reminder.channelId) {
    throw new Error("Channel reminder is missing channelId");
  }

  const channel = await client.channels.fetch(reminder.channelId);

  if (!channel || !channel.isSendable()) {
    throw new Error("Channel is no longer available");
  }

  await channel.send({
    content,
    allowedMentions: { parse: ["users", "roles", "everyone"] },
  });
}

function failureReason(error: unknown): string {
  if (error instanceof Error) {
    if ("code" in error) {
      const code = (error as { code: unknown }).code;

      if (code === 50007) {
        return "DMs are closed. Open your DMs to receive this reminder.";
      }

      if (code === 50013 || code === 50001) {
        return "Missing permission to send in that channel.";
      }

      if (code === 10003) {
        return "Channel no longer exists.";
      }
    }

    return error.message;
  }

  return "Delivery failed.";
}

async function processReminder(client: Client, id: string, nowMs: number): Promise<void> {
  const reminder = await getReminder(id);

  if (!reminder) {
    return;
  }

  const content = buildContent(reminder, nowMs);

  try {
    await deliver(client, reminder, content);
    await settleAfterFire(reminder, nowMs);
  } catch (error) {
    captureException(error, {
      tags: {
        job: "reminder-poller",
        reminderId: reminder.id,
        guildId: reminder.guildId ?? undefined,
        target: reminder.target,
      },
    });

    await markFailedAndReschedule(reminder, failureReason(error), nowMs);
  }
}

async function tick(client: Client): Promise<void> {
  let ids: string[];

  try {
    ids = await claimDueIds(Date.now(), CLAIM_BATCH_SIZE);
  } catch (error) {
    captureException(error, { tags: { job: "reminder-poller", phase: "claim" } });
    console.error("[reminders] failed to claim due reminders", error);
    return;
  }

  if (ids.length === 0) {
    return;
  }

  console.log(`[reminders] firing ${ids.length} reminder(s)`);

  for (const id of ids) {
    const nowMs = Date.now();

    try {
      await processReminder(client, id, nowMs);
    } catch (error) {
      captureException(error, { tags: { job: "reminder-poller", reminderId: id } });
      console.error(`[reminders] failed to process reminder ${id}`, error);
    }
  }
}

export function startReminderPoller(client: Client): () => void {
  void tick(client);

  const timer = setInterval(() => {
    void tick(client);
  }, POLL_INTERVAL_MS);

  timer.unref?.();

  return () => clearInterval(timer);
}
