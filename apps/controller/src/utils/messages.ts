import type { Message, TextBasedChannel } from "discord.js";

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

export function calculateSnowflake(timestamp: number): string {
  const DISCORD_EPOCH = 1420070400000n;
  return ((BigInt(timestamp) - DISCORD_EPOCH) << 22n).toString();
}

export async function fetchMessagesInRange(
  channel: TextBasedChannel,
  timeframeMs: number,
  limit: number,
): Promise<Message<boolean>[]> {
  const messages: Message<boolean>[] = [];
  const endTime = Date.now();
  const startTime = endTime - timeframeMs;
  const startSnowflake = calculateSnowflake(startTime);

  let lastSnowflake: string | undefined = startSnowflake;
  let consecutiveEmptyBatches = 0;
  const maxEmptyBatches = 3;

  while (messages.length < limit) {
    try {
      const fetched = await channel.messages.fetch({
        after: lastSnowflake,
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

      if (filteredMessages.length === 0) {
        consecutiveEmptyBatches++;
        if (consecutiveEmptyBatches >= maxEmptyBatches) {
          break;
        }
      } else {
        consecutiveEmptyBatches = 0;
      }

      const remainingSlots = limit - messages.length;
      const toAdd = filteredMessages.slice(0, remainingSlots);
      messages.push(...toAdd);

      if (fetched.size < 100) {
        break;
      }

      lastSnowflake = messages[messages.length - 1]?.id;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code: number }).code === 50001
      ) {
        throw new Error("Missing permissions to read messages");
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

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
