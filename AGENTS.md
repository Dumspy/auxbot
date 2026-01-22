# AGENTS.md - Developer Guidelines for Auxbot

## Build/Lint/Test Commands

- **Build**: `pnpm build` | **Lint**: `pnpm lint` | **Lint fix**: `pnpm lint:fix` | **Type check**: `pnpm check-types`
- **Format**: `pnpm format` | **Format fix**: `pnpm format:fix`
- **Dev mode**: `pnpm dev` | **Single app**: `pnpm --filter "@auxbot/controller" dev`
- No test framework currently in use

## Architecture

- **Monorepo**: Turborepo + pnpm workspaces; apps in `apps/`, shared code in `packages/`
- **Apps**: `controller` (REST API, spawns K8s jobs), `worker` (job processor, runs and exits)
- **Packages**: `protos` (gRPC/protobuf), `discord` (Discord integration), `sentry`, `typescript-config`
- **Communication**: gRPC via protobuf (see `packages/protos/*.proto`)

## Code Style

- **ESM only**: Use `.js` extensions on all imports
- **TypeScript**: Strict mode, `noUncheckedIndexedAccess: true`, `NodeNext` module resolution
- **Linting**: Oxlint (see `.oxlintrc.json`); group imports: external → workspace → relative
- **Formatting**: Oxfmt (experimental); run `pnpm format:fix` to auto-format
- **Types**: Prefer explicit types; use Zod for runtime validation (see `env.ts` pattern)
- **Error handling**: try-catch, console logs, Sentry's `captureException` with context tags
- **Naming**: camelCase (vars/funcs), PascalCase (classes), UPPER_CASE (env vars)
- **Comments**: DO NOT add comments unless necessary for complex logic
