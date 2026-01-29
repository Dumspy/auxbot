import { defineConfig } from "vitest/config";
import baseConfig from "../../vitest.base.mjs";

export default defineConfig({
  ...baseConfig,
  envDir: false,
  test: {
    ...baseConfig.test,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    env: {
      SKIP_ENV_VALIDATION: "1",
      K8S_NAMESPACE: "auxbot",
      SENTRY_DSN: "test-dsn",
    },
  },
});
