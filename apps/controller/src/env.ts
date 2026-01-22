import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    PORT: z.string().default("3000"),
    K8S_NAMESPACE: z.string(),
    WORKER_IMAGE: z.string().default("ghcr.io/dumspy/auxbot-worker:latest"),
    DISCORD_TOKEN: z.string(),
    DISCORD_CLIENT_ID: z.string(),
    WORKER_GRPC_PORT: z.string().default("50051"),
    INACTIVITY_TIMEOUT_MINUTES: z.string().default("20"),
    SENTRY_DSN: z.string(),
    ZHIPU_API_KEY: z.string(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
