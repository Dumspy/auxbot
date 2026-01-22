# Discord Message Summary Command

A Discord command that summarizes messages from a channel or thread within a user-specified timeframe using AI-powered text summarization.

## Overview

The `/summary` command allows Discord users to generate concise summaries of conversations in channels or threads. Users specify a time range (e.g., "1h", "2d", "30m"), and the command fetches messages from that period and generates a summary using Zhipu AI's GLM-4 model via the Vercel AI SDK.

## Requirements

### Functional Requirements

- Users must be able to invoke a slash command `/summary` in any Discord guild channel or thread
- Command accepts a required `timeframe` parameter (e.g., "1h", "2d", "30m", "1h30m")
- Command accepts an optional `limit` parameter (default: 100, max: 500) to cap messages processed
- System fetches messages from the current channel/thread within the specified timeframe
- System formats messages for AI processing (includes author, timestamp, content)
- System generates a concise summary using Zhipu AI's GLM-4 model
- System returns the summary as a Discord embed with metadata (channel name, timeframe, message count)

### Non-Functional Requirements

- Response time: < 30 seconds for typical usage (< 200 messages)
- Error handling: Graceful degradation with user-friendly error messages
- Rate limiting: Respect Discord API rate limits (50 requests per second)
- Observability: Log errors to Sentry with appropriate context
- Type safety: TypeScript strict mode with explicit types
- Security: API keys stored as environment variables, never exposed

## Architecture

### Component Structure

```
apps/controller/src/
├── commands/
│   └── summary.ts           # Discord slash command handler
├── services/
│   └── ai.ts                # AI service using Vercel AI SDK + Zhipu
└── utils/
    └── messages.ts          # Message fetching and formatting utilities
```

### Data Flow

1. User invokes `/summary` command with timeframe and optional limit
2. Controller command handler validates input
3. Message utility fetches messages from Discord API within timeframe
4. Messages are formatted for AI processing
5. AI service calls Zhipu AI's GLM-4 model via AI SDK
6. Summary is generated and returned to user as Discord embed

## API Design

### Discord Slash Command

**Command:** `/summary`

**Options:**

- `timeframe` (string, required): Time range in format `{number}{unit}` where unit is `m` (minutes), `h` (hours), or `d` (days). Examples: "30m", "2h", "1d", "1h30m"
- `limit` (integer, optional): Maximum number of messages to process. Default: 100, Min: 1, Max: 500

**Response:**

- Success: Discord embed with summary and metadata
- Error: User-friendly message explaining the failure

### Example Usage

```
/summary timeframe:1h
/summary timeframe:2d limit:200
/summary timeframe:30m limit:50
```

### Embed Format

**Success Embed:**

```
📊 Message Summary

Channel: #general
Timeframe: Last 1 hour
Messages Analyzed: 42

[Summary text here...]
```

**Error Response:**

- "No messages found in the specified timeframe."
- "Failed to generate summary: [error details]"
- "Rate limit exceeded. Please try again later."

## Message Fetching

### Timeframe Parsing

Supported formats:

- Single unit: `30m`, `2h`, `1d`
- Multiple units: `1h30m`, `2d6h`, `45m`

Conversion:

- `m` = minutes → multiply by 60,000 ms
- `h` = hours → multiply by 3,600,000 ms
- `d` = days → multiply by 86,400,000 ms

### Discord API Calls

- Use `channel.messages.fetch({ after: snowflake, limit: 100 })` for pagination
- Calculate Discord Snowflake from timestamp: `snowflake = (timestamp - 1420070400000) * 4194304`
- Fetch until timeframe exceeded or message limit reached
- Handle rate limiting with exponential backoff

### Message Formatting

Format for AI processing:

```
[timestamp] <@username>: message content
```

Include:

- Message timestamp (ISO format)
- Author username/mention
- Message content (cleaned of mentions/attachments)
- Attachment filenames (if any)

Skip:

- System messages
- Messages with empty content
- Bot messages (optional, configurable)

## AI Integration

### Provider Configuration

- Provider: Zhipu AI (via `zhipu-ai-provider`)
- Base URL: `https://api.z.ai/api/paas/v4`
- Model: `glm-4-plus`
- API Key: Environment variable `ZHIPU_API_KEY`

### Prompt Engineering

**System Prompt:**

```
You are a helpful assistant that summarizes Discord conversations. Provide a concise, well-structured summary that captures the main topics, decisions, and action items. Use bullet points for clarity.
```

**User Prompt:**

```
Summarize the following Discord messages from [channel name]:

[formatted messages]
```

### Response Handling

- Parse AI-generated summary text
- Validate summary quality (minimum length check)
- Handle API errors gracefully
- Log API failures to Sentry

## Error Handling

### Error Categories

1. **Input Validation Errors**

   - Invalid timeframe format
   - Limit out of range
   - Missing guild context

2. **Discord API Errors**

   - Rate limit exceeded
   - Missing permissions
   - Channel not found

3. **AI API Errors**

   - API key invalid/missing
   - Rate limit exceeded
   - Model unavailable

4. **System Errors**
   - Timeout (> 30 seconds)
   - Unexpected exceptions

### Error Response Messages

- Invalid input: "Invalid timeframe format. Use format like '1h', '30m', '2d'"
- No messages: "No messages found in the specified timeframe."
- Rate limit: "Rate limit exceeded. Please try again later."
- AI error: "Failed to generate summary. Please try again later."

## Security Considerations

- API key stored in environment variable, never exposed in code
- No message content logged or persisted beyond temporary memory
- Validate user has permission to read messages in the channel
- Respect user privacy by excluding sensitive content if detected

## Performance Considerations

- Default message limit: 100 (configurable)
- Timeout: 30 seconds for entire operation
- Pagination: Fetch messages in batches of 100
- Caching: No caching (message content changes frequently)

## Testing Requirements

### Unit Tests

- Timeframe parsing (valid and invalid formats)
- Snowflake calculation
- Message formatting
- Error handling

### Integration Tests

- Discord API message fetching
- AI service integration (mock API)
- Command execution flow

### Manual Testing Scenarios

1. Summarize 1 hour of messages in active channel
2. Summarize 1 day of messages in quiet channel
3. Summarize messages in a thread
4. Test invalid timeframe format
5. Test rate limit handling
6. Test with large message sets (> 500)

## Dependencies

### Required Packages

- `ai` (^latest) - Vercel AI SDK
- `zhipu-ai-provider` (^latest) - Zhipu AI provider
- `discord.js` (already installed) - Discord API
- `zod` (already installed) - Runtime validation

### Environment Variables

- `ZHIPU_API_KEY` (required) - Zhipu AI API key for z.ai

## Future Enhancements

- Support for summarizing DM conversations
- Multiple summary styles (brief, detailed, bullet points)
- Export summaries to files
- Summary caching with TTL
- Filtering by user/role
- Sentiment analysis
- Topic extraction
