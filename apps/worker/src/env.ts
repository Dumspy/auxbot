import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
    server: {
        DISCORD_TOKEN: z.string(),
        DISCORD_CLIENT_ID: z.string(),
        DISCORD_GUILD_ID: z.string(),
        DISCORD_CHANNEL_ID: z.string(),
    },
    runtimeEnv: process.env,
    emptyStringAsUndefined: true,
});