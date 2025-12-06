# AGENTS.md - Developer Guidelines for Auxbot

## Build/Lint/Test Commands

- **Build all**: `pnpm build` (or `turbo run build`)
- **Lint all**: `pnpm lint` (or `turbo run lint`)
- **Type check**: `pnpm check-types` (or `turbo run check-types`)
- **Format**: `pnpm format`
- **Dev mode**: `pnpm dev` (runs all apps with watch mode)
- **Single app commands**: `cd apps/controller` (or `apps/worker`) then run `pnpm build|lint|check-types|dev`
- No test framework currently in use

## Code Style

- **Module system**: ESM only (`.js` extensions required on all imports)
- **TypeScript**: Strict mode enabled, `noUncheckedIndexedAccess: true`, use `NodeNext` module resolution
- **Formatting**: Prettier with defaults
- **Imports**: Group by external packages first, then internal workspace packages, then relative imports
- **Types**: Prefer explicit types, use Zod for runtime validation (see `env.ts` pattern)
- **Error handling**: Use try-catch, log errors to console, use Sentry's `captureException` with context tags
- **Naming**: camelCase for variables/functions, PascalCase for classes, UPPER_CASE for env vars
- **Async**: Prefer async/await over promises chains
- **Comments**: DO NOT add comments unless necessary for complex logic
