import { Redis } from "ioredis";
import { env } from "../env.js";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    client.on("error", (error) => {
      console.error("[redis] connection error", error);
    });
  }

  return client;
}

export function getChannelReminderAllowlist(): Set<string> {
  return new Set(
    env.CHANNEL_REMINDER_USER_IDS.split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );
}
