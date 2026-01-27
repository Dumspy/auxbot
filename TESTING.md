# Testing

## File Naming and Layout

### Test Files
- Tests are `*.test.ts` files
- Two locations:
  - **Colocated tests**: Place next to modules under `src/` (preferred for single-module tests)
  - **Larger test suites**: Place in `test/` directory (for multi-module or integration tests)

### Directory Structure
```
apps/
  controller/
    src/
      *.ts
      *.test.ts  # Colocated tests
    test/
      *.test.ts  # Larger test suites
  worker/
    src/
      *.ts
      *.test.ts
    test/
      *.test.ts
packages/
  testkit/
    src/
      *.ts
      *.test.ts
```

## Commands

### Root Commands
```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch
```

### Filtered Commands
```bash
# Run tests for a specific package
pnpm --filter @auxbot/controller test
pnpm --filter @auxbot/worker test

# Run tests in watch mode for a package
pnpm --filter @auxbot/controller test:watch
pnpm --filter @auxbot/worker test:watch
```

## Mocking Recipes

### Fake Timers
Use Vitest's fake timers for tests involving `setTimeout`, `setInterval`, etc.

```typescript
import { beforeEach, afterEach, vi } from 'vitest';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('should handle inactivity timeout', () => {
  // Set system time
  vi.setSystemTime(new Date('2024-01-01').getTime());

  // Advance time to trigger timeout
  vi.advanceTimersByTime(5 * 60 * 1000);

  expect(mockDeps.processExit).toHaveBeenCalled();
});
```

### K8s API Mocking
K8s clients are injectable via `getCoreV1Api()` and `setCoreV1Api()` functions.

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setCoreV1Api, resetCoreV1Api, createMockCoreV1Api } from '@auxbot/testkit';
import type { CoreV1Api } from '@kubernetes/client-node';

describe('WorkerRegistry', () => {
  let mockK8sApi: CoreV1Api;

  beforeEach(() => {
    mockK8sApi = createMockCoreV1Api();
    setCoreV1Api(mockK8sApi);
  });

  afterEach(() => {
    resetCoreV1Api();
    vi.clearAllMocks();
  });

  it('should register a new worker', async () => {
    const pod = {
      metadata: { name: 'worker-123' },
    } as V1Pod;

    await registry.registerWorker(pod, 'guild1', 'channel1');

    expect(mockK8sApi.createNamespacedPod).toHaveBeenCalled();
  });
});
```

### gRPC Client Mocking
Use testkit factory functions with setter + reset pattern for gRPC clients.

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getMockPlayerClient, setMockPlayerClient, resetMockPlayerClient } from '@auxbot/testkit';

describe('Player', () => {
  beforeEach(() => {
    setMockPlayerClient();
  });

  afterEach(() => {
    resetMockPlayerClient();
    vi.clearAllMocks();
  });

  it('should call gRPC client', async () => {
    const mockClient = getMockPlayerClient();

    await player.addSong('https://example.com/song', 'user1');

    expect(mockClient.addSong).toHaveBeenCalledWith({
      url: 'https://example.com/song',
      requesterId: 'user1',
    });
  });
});
```

### Node Builtins Mocking
Use `vi.mock()` with `node:` prefix for ESM compatibility.

```typescript
import { describe, it, expect, vi } from 'vitest';

// Mock child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  unlink: vi.fn(),
}));

import { spawn } from 'node:child_process';
import { unlink } from 'node:fs/promises';

describe('Player', () => {
  it('should spawn yt-dlp process', () => {
    // Use the mocked spawn function
    spawn('yt-dlp', ['url']);
  });
});
```

## Adding New Mocks to Testkit

To add new mocks to `packages/testkit`:

1. **Create mock file**: `packages/testkit/src/mocks/<name>.ts`
   - Use `vi.fn()` to create mock functions
   - Return appropriate mock values with `mockResolvedValue()` or `mockReturnValue()`

2. **Export from index**: Add to `packages/testkit/src/index.ts`
   ```typescript
   export * from './mocks/<name>.js';
   ```

3. **If using singleton pattern**: Add getter, setter, and reset functions
   ```typescript
   let mockInstance: ReturnType<typeof createMock> | null = null;

   export function createMock() {
     return { /* mock implementation */ };
   }

   export function getMock() {
     if (!mockInstance) {
       mockInstance = createMock();
     }
     return mockInstance;
   }

   export function setMock(instance: ReturnType<typeof createMock>): void {
     mockInstance = instance;
   }

   export function resetMock(): void {
     mockInstance = null;
   }
   ```

4. **Build testkit**: `pnpm --filter @auxbot/testkit build`

5. **Use in tests**: Import from `@auxbot/testkit`

Example: Creating a mock for a new API client

```typescript
// packages/testkit/src/mocks/new-client.ts
import { vi } from 'vitest';
import type { NewClient } from 'new-library';

export function createMockNewClient(): NewClient {
  return {
    someMethod: vi.fn().mockResolvedValue({ success: true }),
    anotherMethod: vi.fn().mockResolvedValue({ success: false }),
  } as any;
}

// packages/testkit/src/index.ts
export * from './mocks/new-client.js';
```

## Test Organization

### Colocated Tests (Preferred)
Place tests next to the code they test:

```
src/
  queue.ts
  queue.test.ts  # Tests queue.ts directly
  player.ts
  player.test.ts  # Tests player.ts directly
```

### Test Suite (Larger Scenarios)
Place multi-module or integration tests in `test/`:

```
test/
  spawn-worker.test.ts  # Tests worker spawning flow (involves multiple modules)
  player-lifecycle.test.ts  # Tests full player lifecycle
```

## Running Tests

### All Tests
```bash
pnpm test
```

Runs all tests across all packages/apps via Turborepo.

### Single Package
```bash
pnpm --filter @auxbot/controller test
pnpm --filter @auxbot/worker test
```

### Watch Mode
```bash
# Watch all packages
pnpm test:watch

# Watch specific package
pnpm --filter @auxbot/controller test:watch
```

## Test Isolation

Every test should clean up after itself:

```typescript
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
```

For mocks with setter + reset pattern:

```typescript
afterEach(() => {
  resetCoreV1Api();
  resetMockPlayerClient();
  vi.clearAllMocks();
});
```

This ensures tests don't interfere with each other.
