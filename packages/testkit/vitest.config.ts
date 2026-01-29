import { defineConfig } from "vitest/config";
import baseConfig from "../../vitest.base.mjs";

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
  },
});
