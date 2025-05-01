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
    },
    runtimeEnv: process.env,
    emptyStringAsUndefined: true,
});