# Plan: YouTube Search with Interactive Selection for Play Command

## Overview
Add YouTube search support to the `/play` command with interactive selection menu, showing 5 results per page with pagination support.

---

## Implementation

### 1. Protobuf Definition (`packages/protos/search.proto`)

Create new search service for YouTube search operations.

**Key points:**
- Service: `Search` with `SearchYouTube` RPC
- Request: query, page (0-indexed), limit (default 5)
- Response: results array, has_more boolean
- SearchResult includes: id, title, url, uploader, duration (seconds), thumbnail, view_count

---

### 2. Worker: gRPC Server Implementation (`apps/worker/src/grpc/server/search.ts`)

Implement the search service that uses yt-dlp to search YouTube.

**Key points:**
- Use `spawn("yt-dlp")` with flags: `--flat-playlist --dump-json --quiet --no-warnings`
- Search format: `ytsearch${offset + limit}:${query}`
- Parse JSONL output (one JSON per line)
- Slice results for pagination: skip offset, take limit
- Map yt-dlp output to SearchResult proto format
- Handle errors and return meaningful error messages
- Register service with grpc server

---

### 3. Worker: Register Search Service (`apps/worker/src/grpc/index.ts`)

Import the search service in the gRPC server initialization.

**Change:**
- Add `await import("./server/search.js");` to `loadServices()`

---

### 4. Controller: gRPC Client Implementation (`apps/controller/src/grpc/client/search.ts`)

Create client for the search service.

**Key points:**
- Create `SearchClient` using guild-specific worker address
- Implement `searchYouTube(guildId, query, page, limit)` function
- Return Promise with `SearchResponse`
- Include Sentry error capture with context tags
- Follow same pattern as existing player client

---

### 5. Controller: Helper Functions (`apps/controller/src/utils/youtube.ts`)

Create utility functions for YouTube operations.

**Functions:**
- `formatDuration(seconds: number): string` - Convert seconds to MM:SS format
- `isYouTubeUrl(input: string): boolean` - Check if input is YouTube URL

---

### 6. Controller: Update Play Command (`apps/controller/src/commands/play.ts`)

Complete rewrite to support both URLs and search queries.

**Features:**

**URL Detection:**
- Use `isYouTubeUrl()` to detect URLs vs search queries
- If URL → proceed directly to `addSong()`
- If query → show search menu

**Search Menu UI:**
- Create embed with search results (title, duration, uploader)
- Show 5 results per page
- Include page number in footer

**Buttons:**
- First row: 1-5 select buttons (Primary style)
- Second row: Prev, Next, Cancel buttons
- Prev disabled on first page
- Next disabled when no more results

**Interaction Handling:**
- Defer reply while searching
- Store search state (results, page, query, guildId, userId, message) in Map
- Filter interactions by user ID
- 30-second timeout on all interactions
- Recursively handle pagination navigation
- Clear embeds/components after selection/cancel/timeout

**Pagination Logic:**
- Prev: decrement page, fetch new results, update UI
- Next: increment page, fetch new results, update UI
- Update buttons based on has_more flag

**Selection Flow:**
- User clicks select button → call `addSong()` with selected URL
- Update message with "Now Playing" or "Added to Queue" confirmation
- Clear state from Map

**Error Handling:**
- No results found → "No results found."
- Search failed → "Failed to search. Please try again."
- Worker unavailable → existing check preserved
- Guild check → existing check preserved

---

### 7. Protos: Update Package Exports (`packages/protos/package.json`)

Add export mapping for the new search proto.

**Change:**
- Add `"./search"` export mapping to `"src/generated/search.ts"`

---

### 8. Build Steps

After implementing all files:

```bash
# 1. Generate TypeScript from proto
cd packages/protos
pnpm generate

# 2. Build protos package
pnpm --filter @auxbot/protos build

# 3. Build entire monorepo
pnpm build

# 4. Run lint and typecheck
pnpm lint
pnpm check-types
```

---

## Files Summary

| File | Action |
|------|--------|
| `packages/protos/search.proto` | NEW - Search service definition |
| `packages/protos/package.json` | EDIT - Add export for search |
| `apps/worker/src/grpc/server/search.ts` | NEW - gRPC server implementation |
| `apps/worker/src/grpc/index.ts` | EDIT - Load search service |
| `apps/controller/src/grpc/client/search.ts` | NEW - gRPC client implementation |
| `apps/controller/src/utils/youtube.ts` | NEW - Helper functions |
| `apps/controller/src/commands/play.ts` | EDIT - Add search with pagination |

---

## Key Features

- Automatic URL detection vs search query
- Pagination with Prev/Next buttons
- 5 results per page
- Duration formatting (seconds → MM:SS)
- 30-second timeout on interactions
- User filtering (only requester can interact)
- Comprehensive error handling with Sentry integration
- Clean UI with embeds and button interactions
