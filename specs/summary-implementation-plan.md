# Summary Feature Implementation Plan

Implementation checklist for the Discord message summary feature as specified in [summary-feature.md](./summary-feature.md).

## Phase 1: Dependencies and Configuration

- [x] Add `ai` package to `apps/controller/package.json`
  - Source: [Dependencies section](./summary-feature.md#dependencies)
- [x] Add `zhipu-ai-provider` package to `apps/controller/package.json`
  - Source: [Dependencies section](./summary-feature.md#dependencies)
- [x] Add `ZHIPU_API_KEY` to environment schema in `apps/controller/src/env.ts`
  - Source: [Environment Variables section](./summary-feature.md#environment-variables)
- [x] Install dependencies with `pnpm install`
  - Source: [README.md build commands](../README.md#development)

## Phase 2: AI Service

- [x] Create directory `apps/controller/src/services/`
  - Source: [Component Structure section](./summary-feature.md#component-structure)
- [x] Create file `apps/controller/src/services/ai.ts`
  - Source: [Component Structure section](./summary-feature.md#component-structure)
- [x] Import `createZhipu` from `zhipu-ai-provider`
  - Source: [Provider Configuration section](./summary-feature.md#provider-configuration)
- [x] Import `generateText` from `ai`
  - Source: [Provider Configuration section](./summary-feature.md#provider-configuration)
- [x] Create Zhipu provider instance with base URL `https://api.z.ai/api/paas/v4`
  - Source: [Provider Configuration section](./summary-feature.md#provider-configuration)
- [x] Create `generateSummary()` function that accepts messages and returns summary text
  - Source: [AI Integration section](./summary-feature.md#ai-integration)
- [x] Implement system prompt for conversation summarization
  - Source: [Prompt Engineering section](./summary-feature.md#prompt-engineering)
- [x] Implement user prompt with message formatting
  - Source: [Prompt Engineering section](./summary-feature.md#prompt-engineering)
- [x] Add error handling with try-catch and Sentry logging
  - Source: [Error Handling section](./summary-feature.md#error-handling)
- [x] Add 30-second timeout for AI API calls
  - Source: [Performance Considerations section](./summary-feature.md#performance-considerations)

## Phase 3: Message Utilities

- [x] Create directory `apps/controller/src/utils/`
  - Source: [Component Structure section](./summary-feature.md#component-structure)
- [x] Create file `apps/controller/src/utils/messages.ts`
  - Source: [Component Structure section](./summary-feature.md#component-structure)
- [x] Create `parseTimeframe()` function to parse timeframe strings
  - Source: [Timeframe Parsing section](./summary-feature.md#timeframe-parsing)
- [x] Support single-unit formats: `30m`, `2h`, `1d`
  - Source: [Timeframe Parsing section](./summary-feature.md#timeframe-parsing)
- [x] Support multi-unit formats: `1h30m`, `2d6h`, `45m`
  - Source: [Timeframe Parsing section](./summary-feature.md#timeframe-parsing)
- [x] Implement unit conversion (minutes/hours/days to milliseconds)
  - Source: [Timeframe Parsing section](./summary-feature.md#timeframe-parsing)
- [x] Create `calculateSnowflake()` function for Discord timestamps
  - Source: [Discord API Calls section](./summary-feature.md#discord-api-calls)
- [x] Create `fetchMessagesInRange()` function
  - Source: [Discord API Calls section](./summary-feature.md#discord-api-calls)
- [x] Implement pagination with `channel.messages.fetch({ after: snowflake, limit: 100 })`
  - Source: [Discord API Calls section](./summary-feature.md#discord-api-calls)
- [x] Stop fetching when timeframe exceeded or message limit reached
  - Source: [Discord API Calls section](./summary-feature.md#discord-api-calls)
- [x] Implement exponential backoff for rate limiting
  - Source: [Discord API Calls section](./summary-feature.md#discord-api-calls)
- [x] Create `formatMessages()` function for AI processing
  - Source: [Message Formatting section](./summary-feature.md#message-formatting)
- [x] Include timestamp, author, content, attachment filenames
  - Source: [Message Formatting section](./summary-feature.md#message-formatting)
- [x] Skip system messages and empty messages
  - Source: [Message Formatting section](./summary-feature.md#message-formatting)

## Phase 4: Summary Command

- [x] Create file `apps/controller/src/commands/summary.ts`
  - Source: [Component Structure section](./summary-feature.md#component-structure)
- [x] Import `registerInteraction` from `@auxbot/discord/interaction`
  - Source: Pattern from existing commands (e.g., `play.ts`)
- [x] Import `SlashCommandBuilder`, `EmbedBuilder` from `discord.js`
  - Source: Pattern from existing commands (e.g., `queue.ts`)
- [x] Import `captureException` from `@auxbot/sentry`
  - Source: Pattern from existing commands (e.g., `join.ts`)
- [x] Import AI service functions
  - Source: [Component Structure section](./summary-feature.md#component-structure)
- [x] Import message utility functions
  - Source: [Component Structure section](./summary-feature.md#component-structure)
- [x] Create slash command with name `summary`
  - Source: [API Design section](./summary-feature.md#api-design)
- [x] Add required `timeframe` string option
  - Source: [API Design section](./summary-feature.md#api-design)
- [x] Add optional `limit` integer option (default: 100, min: 1, max: 500)
  - Source: [API Design section](./summary-feature.md#api-design)
- [x] Implement `execute()` handler
  - Source: [API Design section](./summary-feature.md#api-design)
- [x] Validate guild context exists
  - Source: [Error Handling section](./summary-feature.md#error-handling)
- [x] Validate channel context exists
  - Source: [Error Handling section](./summary-feature.md#error-handling)
- [x] Validate timeframe format using Zod
  - Source: [Error Handling section](./summary-feature.md#error-handling)
- [x] Validate limit is within range
  - Source: [Error Handling section](./summary-feature.md#error-handling)
- [x] Call `interaction.deferReply()` for long operations
  - Source: Pattern from existing commands (e.g., `join.ts`)
- [x] Parse timeframe using utility function
  - Source: [Data Flow section](./summary-feature.md#data-flow)
- [x] Fetch messages using utility function
  - Source: [Data Flow section](./summary-feature.md#data-flow)
- [x] Format messages using utility function
  - Source: [Data Flow section](./summary-feature.md#data-flow)
- [x] Call AI service to generate summary
  - Source: [Data Flow section](./summary-feature.md#data-flow)
- [x] Handle no messages found case
  - Source: [Error Response Messages section](./summary-feature.md#error-response-messages)
- [x] Create Discord embed with summary
  - Source: [Embed Format section](./summary-feature.md#embed-format)
- [x] Include channel name, timeframe, message count
  - Source: [Embed Format section](./summary-feature.md#embed-format)
- [x] Send reply with embed
  - Source: [API Design section](./summary-feature.md#api-design)
- [x] Wrap in try-catch with Sentry error logging
  - Source: Pattern from existing commands (e.g., `join.ts`)
- [x] Provide user-friendly error messages
  - Source: [Error Response Messages section](./summary-feature.md#error-response-messages)
  - Source: Pattern from existing commands (e.g., `queue.ts`)

## Phase 5: Error Handling and Validation

- [ ] Implement input validation for timeframe format
  - Source: [Error Handling section](./summary-feature.md#error-handling)
- [ ] Implement input validation for limit range
  - Source: [Error Handling section](./summary-feature.md#error-handling)
- [ ] Handle Discord API rate limit errors
  - Source: [Error Handling section](./summary-feature.md#error-handling)
- [ ] Handle missing permissions errors
  - Source: [Error Handling section](./summary-feature.md#error-handling)
- [ ] Handle AI API errors (invalid key, rate limit, model unavailable)
  - Source: [Error Handling section](./summary-feature.md#error-handling)
- [ ] Handle timeout errors (> 30 seconds)
  - Source: [Error Handling section](./summary-feature.md#error-handling)
- [ ] Log all errors to Sentry with appropriate context
  - Source: Pattern from existing commands (e.g., `join.ts`)

## Phase 6: Testing

- [ ] Test timeframe parsing with valid formats
  - Source: [Testing Requirements section](./summary-feature.md#testing-requirements)
- [ ] Test timeframe parsing with invalid formats
  - Source: [Testing Requirements section](./summary-feature.md#testing-requirements)
- [ ] Test snowflake calculation accuracy
  - Source: [Testing Requirements section](./summary-feature.md#testing-requirements)
- [ ] Test message formatting output
  - Source: [Testing Requirements section](./summary-feature.md#testing-requirements)
- [ ] Test AI service integration with mock API
  - Source: [Testing Requirements section](./summary-feature.md#testing-requirements)
- [ ] Test command execution in active channel (1 hour)
  - Source: [Manual Testing Scenarios section](./summary-feature.md#manual-testing-scenarios)
- [ ] Test command execution in quiet channel (1 day)
  - Source: [Manual Testing Scenarios section](./summary-feature.md#manual-testing-scenarios)
- [ ] Test command execution in thread
  - Source: [Manual Testing Scenarios section](./summary-feature.md#manual-testing-scenarios)
- [ ] Test invalid timeframe format error handling
  - Source: [Manual Testing Scenarios section](./summary-feature.md#manual-testing-scenarios)
- [ ] Test rate limit handling
  - Source: [Manual Testing Scenarios section](./summary-feature.md#manual-testing-scenarios)
- [ ] Test large message sets (> 500)
  - Source: [Manual Testing Scenarios section](./summary-feature.md#manual-testing-scenarios)

## Phase 7: Quality Assurance

- [x] Run lint: `pnpm lint`
  - Source: [README.md build commands](../README.md#buildlinttest-commands)
- [x] Run typecheck: `pnpm check-types`
  - Source: [README.md build commands](../README.md#buildlinttest-commands)
- [x] Run format: `pnpm format`
  - Source: [README.md build commands](../README.md#buildlinttest-commands)
- [x] Verify ESM imports use `.js` extensions
  - Source: [Code Style - ESM only](../AGENTS.md#code-style)
- [x] Verify TypeScript strict mode compliance
  - Source: [Code Style - TypeScript](../AGENTS.md#code-style)
- [x] Verify no comments added (unless necessary)
  - Source: [Code Style - Comments](../AGENTS.md#code-style)
- [x] Verify Sentry error logging implemented
  - Source: [Error handling pattern](../AGENTS.md#error-handling)

## Phase 8: Documentation

- [ ] Update README.md with new command usage examples
  - Source: [Future Enhancements - Documentation](../README.md)

---

**Status:** Ready for implementation
**Last Updated:** 2026-01-22
**Specification:** [summary-feature.md](./summary-feature.md)
