import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
    server: {
        SENTRY_DSN: z.string(),
        NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    },
    runtimeEnv: process.env,
    emptyStringAsUndefined: true,
});