import type { Message, TextBasedChannel } from "discord.js";
import { z } from "zod";

export const timeframeSchema = z
  .string()
  .regex(/^\d+[mhd](?:\d+[mhd])*$/i, {
    message: "Invalid timeframe format. Use format like 1h, 30m, 2d6h",
  })
  .refine((timeframe) => parseTimeframe(timeframe).totalMs > 0, {
    message: "Timeframe must be greater than zero",
  });

export interface ParsedTimeframe {
  totalMs: number;
  units: { value: number; unit: "m" | "h" | "d" }[];
}

export function parseTimeframe(timeframe: string): ParsedTimeframe {
  const regex = /(\d+)([mhd])/gi;
  const matches = Array.from(timeframe.matchAll(regex));

  if (matches.length === 0) {
    throw new Error("Invalid timeframe format");
  }

  const units: { value: number; unit: "m" | "h" | "d" }[] = [];
  let totalMs = 0;

  for (const match of matches) {
    const valueStr = match[1];
    const unitStr = match[2];
    if (valueStr === undefined || unitStr === undefined) continue;
    const value = parseInt(valueStr, 10);
    const unit = unitStr.toLowerCase() as "m" | "h" | "d";

    if (unit === "m") {
      totalMs += value * 60_000;
    } else if (unit === "h") {
      totalMs += value * 3_600_000;
    } else if (unit === "d") {
      totalMs += value * 86_400_000;
    }

    units.push({ value, unit });
  }

  return { totalMs, units };
}

export async function fetchMessagesInRange(
  channel: TextBasedChannel,
  timeframeMs: number,
  limit: number,
): Promise<Message<boolean>[]> {
  const messages: Message<boolean>[] = [];
  const endTime = Date.now();
  const startTime = endTime - timeframeMs;
  const maxRetries = 5;

  let beforeId: string | undefined;
  let retries = 0;

  while (messages.length < limit) {
    try {
      const fetched = await channel.messages.fetch({
        before: beforeId,
        limit: 100,
      });

      const filteredMessages: Message<boolean>[] = [];
      for (const msg of fetched.values()) {
        if (
          msg.createdTimestamp > startTime &&
          !msg.system &&
          (msg.content.trim().length > 0 || msg.attachments.size > 0)
        ) {
          filteredMessages.push(msg);
        }
      }

      if (fetched.size === 0) {
        break;
      }

      const remainingSlots = limit - messages.length;
      const toAdd = filteredMessages.slice(0, remainingSlots);
      messages.push(...toAdd);

      const lastMessage = fetched.last();
      if (lastMessage && lastMessage.createdTimestamp <= startTime) {
        break;
      }

      beforeId = lastMessage?.id;
      retries = 0;
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as { code: number }).code === 50001) {
        throw new Error("Missing permissions to read messages");
      }

      retries++;
      if (retries >= maxRetries) {
        throw new Error(`Failed to fetch messages after ${maxRetries} retries`);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  messages.reverse();
  return messages;
}

export function formatMessages(messages: Message<boolean>[]): string {
  return messages
    .map((msg) => {
      const timestamp = msg.createdAt.toISOString();
      const author = msg.author.username;
      const content = msg.content.trim();
      const attachments =
        msg.attachments.size > 0
          ? ` [${Array.from(msg.attachments.values())
              .map((a) => a.name)
              .join(", ")}]`
          : "";

      return `[${timestamp}] <@${author}>: ${content}${attachments}`;
    })
    .join("\n");
}
