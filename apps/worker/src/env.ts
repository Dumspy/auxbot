import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
    server: {
        DISCORD_TOKEN: z.string(),
        DISCORD_CLIENT_ID: z.string(),
        DISCORD_GUILD_ID: z.string(),
        DISCORD_CHANNEL_ID: z.string(),
        GRPC_PORT: z.string().default("50051"),
        INACTIVITY_TIMEOUT_MINUTES: z.string().default("20"),
    },
    runtimeEnv: process.env,
    emptyStringAsUndefined: true,
});