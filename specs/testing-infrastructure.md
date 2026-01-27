# Testing Infrastructure Foundation

**Effort Estimate:** L (1–2 days)

## Overview

Auxbot currently has no test coverage. This spec establishes a Vitest-based testing foundation to prevent regressions, document behavior, and enable testing of new features across all apps and packages.

**Approach:** Vitest with Turborepo per-package execution, adapter modules for mockability, and a shared testkit package.

**Scope:** All apps (controller, worker) and packages. Tests are `*.test.ts` files placed in `src/` (colocated, preferred) or `test/` (larger suites).

## Requirements

### S1. Tooling & Configuration

#### S1.1 Turborepo Per-Package Execution
Each package/app runs its own Vitest instance via Turborepo. This enables:
- Independent test execution per package (`pnpm --filter @auxbot/worker test`)
- Parallel execution across packages in CI

**Note:** Test caching is disabled (`"cache": false` in turbo.json) to avoid flakiness. Caching tests can cause issues when test files reference external state (mocks, filesystem, timers) that may have changed since the last run. Turbo provides parallelism, not caching for tests.

**Acceptance criteria:**
- `pnpm test` runs Turbo which executes each package's `vitest run`
- `pnpm --filter <package> test` runs tests for a single package

#### S1.2 Shared Base Config
A root `vitest.base.ts` MUST provide shared defaults:
- Node test environment
- ESM module resolution
- Standard reset behavior (`clearMocks`, `mockReset`, `restoreMocks`)
- Coverage configuration (no thresholds enforced in v1)

**Acceptance criteria:**
- `vitest.base.ts` exists at repo root
- Each project `vitest.config.ts` extends the base config

#### S1.3 Per-Project Vitest Configs
Each app/package MUST have `vitest.config.ts` extending base config with:
- Include patterns for `src/**/*.test.ts` and `test/**/*.test.ts`
- Per-project path aliases or setup files (if required)

**Acceptance criteria:**
- `apps/controller/vitest.config.ts` exists
- `apps/worker/vitest.config.ts` exists
- `packages/testkit/vitest.config.ts` exists

---

### S2. Test Layout & Conventions

#### S2.1 Test File Location
- **Colocated tests:** `*.test.ts` next to modules under `src/` (preferred for most tests that test a single module)
- **Larger test suites:** `test/*.test.ts` for tests spanning multiple modules or integration-style tests

All tests run together with `pnpm test`. No formal unit/integration distinction in the testing framework — goal is comprehensive coverage of all scenarios. The distinction is organizational: colocated for focused testing, `test/` for broader scenarios.

**Basic test example:**
```typescript
import { describe, it, expect } from 'vitest';

describe('Queue', () => {
  it('should add items to queue', () => {
    const queue = new Queue();
    queue.add('song1');
    expect(queue.size()).toBe(1);
  });
});
```

**Acceptance criteria:**
- Tests discoverable via patterns `src/**/*.test.ts` and `test/**/*.test.ts`

---

### S3. Adapter Modules (Mockability Boundary)

Production code MUST NOT call hard-to-mock system/external APIs directly. It MUST call thin adapter modules so tests can substitute fakes via dependency injection.

**Note:** `process.exit()` is a Node built-in system call that terminates the program. It cannot be easily mocked with `vi.mock()` and must be wrapped in an injectable function for testability.

**Key principles:**
- Use existing library types directly (e.g., `@kubernetes/client-node`, `@discordjs/voice`)
- Every setter MUST have a corresponding reset function for test isolation (forgot resets cause test contamination)
- Use `node:` prefix for Node builtins (`node:fs`, `node:child_process`) for consistent ESM mocking

**Flow:**
```
Production code:  getCoreV1Api() → adapter → real K8s client
Test code:        setCoreV1Api(mock) → adapter → mock K8s client
Test cleanup:      afterEach(() => resetCoreV1Api())
```

#### S3.1 Kubernetes Adapter (Controller)
Refactor K8s client creation to be injectable. **Two files need changes:**

**1. `apps/controller/src/k8s.ts`** — currently creates clients at import time (lines 6–10)

**2. `apps/controller/src/registry/worker-registry.ts`** — `WorkerRegistry` creates its own K8s client in constructor AND starts async work (`loadExistingWorkers`, `setInterval` for health checks)

**Solution for k8s.ts:**
```typescript
let coreV1Api: k8s.CoreV1Api | null = null;

export function getCoreV1Api(): k8s.CoreV1Api {
  if (!coreV1Api) {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    coreV1Api = kc.makeApiClient(k8s.CoreV1Api);
  }
  return coreV1Api;
}

export function setCoreV1Api(api: k8s.CoreV1Api): void {
  coreV1Api = api;
}

export function resetCoreV1Api(): void {
  coreV1Api = null;
}
```

**Solution for WorkerRegistry:**
- Accept `k8sApi` as constructor parameter (optional, defaults to creating one via `getCoreV1Api()`)
- Defer `loadExistingWorkers()` and `startHealthChecks()` to explicit `init()` method
- This allows tests to create `WorkerRegistry` without triggering K8s calls or timers
- **Migration path:** Production code must call `registry.init()` after construction; this is a breaking change

**Acceptance criteria:**
- No K8s client created at import-time
- Tests call `setCoreV1Api(mock)` + `afterEach(() => resetCoreV1Api())`
- WorkerRegistry testable without real K8s or timers

**Example test usage:**
```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getCoreV1Api, setCoreV1Api, resetCoreV1Api } from './k8s.js';
import { createMockCoreV1Api } from '@auxbot/testkit';

describe('WorkerRegistry', () => {
  const mockK8sApi = createMockCoreV1Api();

  beforeEach(() => {
    setCoreV1Api(mockK8sApi);
  });

  afterEach(() => {
    resetCoreV1Api();
    vi.clearAllMocks();
  });

  it('should register a new worker', async () => {
    const registry = new WorkerRegistry({ k8sApi: getCoreV1Api() });

    await registry.registerWorker({
      guildId: '123',
      podName: 'worker-123',
      lastSeen: Date.now(),
    });

    expect(mockK8sApi.createNamespacedPod).toHaveBeenCalledWith('auxbot', expect.any(Object));
  });
});
```

#### S3.2 Discord Voice Adapter (Worker)
Voice operations in `player.ts` should be injectable for testing.

**Acceptance criteria:**
- `createPlayer(deps)` factory accepts voice-related dependencies
- Tests can supply mock voice connection/player
- Uses `@discordjs/voice` types directly

**Example implementation:**
```typescript
// apps/worker/src/player.ts
import type { VoiceConnection, AudioPlayer, AudioResource } from '@discordjs/voice';
import { createVoiceConnection as createDiscordVoiceConnection } from '@discordjs/voice';
import { spawn } from 'node:child_process';

interface PlayerDeps {
  createVoiceConnection: (channelId: string, guildId: string) => VoiceConnection;
  createAudioPlayer: () => AudioPlayer;
  processExit: (code: number) => never;
}

function createProductionDeps(): PlayerDeps {
  return {
    createVoiceConnection: createDiscordVoiceConnection,
    createAudioPlayer: () => new AudioPlayer(),
    processExit: (code: number) => process.exit(code),
  };
}

let defaultDeps: PlayerDeps = createProductionDeps();

export function createPlayer(deps: Partial<PlayerDeps> = {}): AudioPlayer {
  const mergedDeps = { ...defaultDeps, ...deps };
  const player = mergedDeps.createAudioPlayer();
  return player;
}

export function setDefaultDeps(deps: PlayerDeps): void {
  defaultDeps = deps;
}

export function resetDefaultDeps(): void {
  defaultDeps = createProductionDeps();
}
```

**Example test usage:**
```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPlayer, setDefaultDeps, resetDefaultDeps } from './player.js';

describe('Player', () => {
  const mockAudioPlayer = { play: vi.fn(), stop: vi.fn() } as any;
  const mockDeps = {
    createAudioPlayer: () => mockAudioPlayer,
    createVoiceConnection: vi.fn(),
    processExit: vi.fn(),
  };

  beforeEach(() => {
    setDefaultDeps(mockDeps);
  });

  afterEach(() => {
    resetDefaultDeps();
    vi.clearAllMocks();
  });

  it('should create audio player with injected deps', () => {
    const player = createPlayer();
    player.play({} as any);

    expect(mockAudioPlayer.play).toHaveBeenCalled();
  });
});
```

#### S3.3 System Wrappers (Worker)
Wrap system calls to allow test substitution. Use `node:` prefix for ESM compatibility:
- `spawn` → `vi.mock('node:child_process')`
- `process.exit` → wrap in injectable function
- `fs` operations → `vi.mock('node:fs')`

**Acceptance criteria:**
- Production code imports `node:child_process`, `node:fs` (not bare `fs`)
- No direct `process.exit()` in testable code paths (wrap it)
- Tests can mock via `vi.mock()` with matching specifiers

---

### S4. Testkit Package

A new package `packages/testkit` MUST exist with shared testing utilities.

**Purpose:** Provide reusable mocks and helpers that multiple apps can use. Since we use library types directly and Vitest's `vi.mock()`, testkit is lightweight.

**Dependency:** Apps add `@auxbot/testkit` as a **devDependency** only. Testkit MUST NOT import from `apps/*` to avoid circular dependencies.

**Testkit dependencies:** The testkit package may require type-only dependencies (e.g., `@kubernetes/client-node` for types) as devDependencies since it provides mock factories that return typed mocks.

**Required modules:**
- `packages/testkit/src/mocks/k8s.ts` — Mock K8s `CoreV1Api` with configurable responses
- `packages/testkit/src/mocks/grpc-client.ts` — Mock gRPC client functions (`addSong`, `skipSong`, etc.)
- `packages/testkit/src/helpers/index.ts` — Common test utilities (e.g., `flushPromises()`, `waitFor()`)
- `packages/testkit/src/index.ts` — public exports

**gRPC mocking approach:** Use testkit factory functions with setter + reset pattern. This keeps gRPC mocking consistent with K8s adapters and enables proper test isolation.

#### S4.1 K8s Mock Implementation

`packages/testkit/src/mocks/k8s.ts`:
```typescript
import type { CoreV1Api } from '@kubernetes/client-node';

export function createMockCoreV1Api(): CoreV1Api {
  return {
    createNamespacedPod: vi.fn().mockResolvedValue({ body: { metadata: { name: 'test-pod' } } }),
    deleteNamespacedPod: vi.fn().mockResolvedValue({ body: {} }),
    listNamespacedPod: vi.fn().mockResolvedValue({ body: { items: [] } }),
    readNamespacedPod: vi.fn().mockResolvedValue({ body: { metadata: { name: 'test-pod' } } }),
    patchNamespacedPod: vi.fn().mockResolvedValue({ body: {} }),
  } as any;
}
```

#### S4.2 gRPC Client Mock Implementation

`packages/testkit/src/mocks/grpc-client.ts`:
```typescript
import { vi } from 'vitest';

let mockPlayerClient: ReturnType<typeof createMockPlayerClient> | null = null;

export function createMockPlayerClient() {
  return {
    addSong: vi.fn().mockResolvedValue({ success: true }),
    skipSong: vi.fn().mockResolvedValue({ success: true }),
    pauseSong: vi.fn().mockResolvedValue({ success: true }),
    resumeSong: vi.fn().mockResolvedValue({ success: true }),
    queueSong: vi.fn().mockResolvedValue({ success: true }),
    clearQueue: vi.fn().mockResolvedValue({ success: true }),
  };
}

export function getMockPlayerClient() {
  if (!mockPlayerClient) {
    mockPlayerClient = createMockPlayerClient();
  }
  return mockPlayerClient;
}

export function setMockPlayerClient(client: ReturnType<typeof createMockPlayerClient>): void {
  mockPlayerClient = client;
}

export function resetMockPlayerClient(): void {
  mockPlayerClient = null;
}
```

#### S4.3 Helper Implementation

`packages/testkit/src/helpers/index.ts`:
```typescript
export async function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(() => resolve());
  });
}

export function waitFor<T>(
  condition: () => T | undefined,
  options: { timeout?: number; interval?: number } = {}
): Promise<T> {
  const { timeout = 5000, interval = 100 } = options;
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      try {
        const result = condition();
        if (result !== undefined) {
          resolve(result);
        } else if (Date.now() - startTime > timeout) {
          reject(new Error(`Condition not met within ${timeout}ms`));
        } else {
          setTimeout(check, interval);
        }
      } catch (error) {
        reject(error);
      }
    };
    check();
  });
}
```

**Acceptance criteria:**
- Apps can import from `@auxbot/testkit` in tests
- Mocks are minimal, deterministic, and typed
- No circular dependencies between packages

---

### S5. Commands & Turborepo Integration

#### S5.1 Turborepo Pipeline
`turbo.json` MUST define a `test` task pipeline.

**Acceptance criteria:**
- `pnpm test` runs via Turbo across all packages/apps

#### S5.2 Scripts
Root and each app/package MUST expose: `test`, `test:watch`

**Supported commands:**
```bash
pnpm test                                  # run all tests
pnpm --filter @auxbot/controller test      # run controller tests only
pnpm --filter @auxbot/worker test          # run worker tests only
pnpm --filter @auxbot/worker test:watch    # watch mode
```

---

### S6. Example Tests (Critical Paths)

The following example tests MUST exist to validate the testing infrastructure:

- `apps/worker/src/queue.test.ts` — tests Queue class (`add`, `pop`, `clear`)
- `apps/controller/src/registry/worker-registry.test.ts` — tests WorkerRegistry with mocked K8s
- `apps/controller/test/spawn-worker.test.ts` — tests `spawnWorkerPod` with mocked K8s client
- `apps/worker/test/player-lifecycle.test.ts` — tests player with mocked voice/spawn/timers

**Acceptance criteria:**
- Each test runs under `pnpm test`
- Tests demonstrate using `@auxbot/testkit` mocks, `vi.mock()`, and fake timers
- Tests are deterministic (no real K8s/Discord/process.exit)

---

### S7. Documentation

`TESTING.md` MUST exist and document:
- Test file naming/layout conventions
- Commands (root + filtered + watch)
- Mocking recipes:
  - Fake timers (`vi.useFakeTimers()` / `vi.advanceTimersByTime()`)
  - K8s mocking via setter + reset (`setCoreV1Api()` / `resetCoreV1Api()`)
  - gRPC client mocking via testkit factory with setter + reset (`getMockPlayerClient()`, `setMockPlayerClient()`, `resetMockPlayerClient()`)
  - Node builtins via `vi.mock('node:child_process')` etc.
- How to add new mocks to testkit

**Acceptance criteria:**
- New contributor can add tests following documented conventions

---

## Architecture

### Directory Structure

```
apps/
  controller/
    src/
      *.ts
      *.test.ts              # colocated tests
      k8s.ts                 # refactored: lazy init + set/reset
      registry/
        worker-registry.ts   # refactored: injectable k8sApi + init()
        worker-registry.test.ts
    test/
      spawn-worker.test.ts   # tests spawnWorkerPod flow
      setup.ts               # afterEach resets (resetCoreV1Api, resetDefaultDeps, vi.clearAllMocks())
    vitest.config.ts
  worker/
    src/
      *.ts
      *.test.ts
      queue.test.ts          # tests Queue class
      player.ts              # refactored: createPlayer(deps) factory
    test/
      player-lifecycle.test.ts
      setup.ts               # afterEach resets
    vitest.config.ts

packages/
  testkit/                   # Shared test utilities (devDependency)
    src/
      mocks/
        k8s.ts               # createMockCoreV1Api()
        grpc-client.ts       # mockPlayerClient()
      helpers/
        index.ts             # flushPromises(), waitFor()
      index.ts
    package.json
    tsconfig.json
    vitest.config.ts

vitest.base.ts               # shared config
TESTING.md
```

**Note:** `pnpm-workspace.yaml` may need updates to include the new `packages/testkit` package.
```

---

## Non-Goals (v1)

- Real-cluster E2E testing (K8s/Discord)
- Coverage thresholds enforced
- CI integration (structure must not block later CI)
- Performance/load testing

---

## Dependencies

### Required Packages

**Root devDependencies:**
- `vitest` — test framework
- `@vitest/coverage-v8` — coverage reporting (optional)

**Apps devDependencies:**
- `@auxbot/testkit` — shared test utilities (new package)

---

## Key Files Requiring Modification

| File | Change Required | Complexity | Spec Reference |
|------|-----------------|------------|----------------|
| `apps/controller/src/k8s.ts` | Lazy init + `set/resetCoreV1Api()` | Low | S3.1 |
| `apps/controller/src/registry/worker-registry.ts` | Injectable k8sApi + `init()` method | Medium | S3.1 |
| `apps/worker/src/player.ts` | Export `createPlayer(deps)` factory | Medium | S3.2 |
| `apps/worker/src/*.ts` | Use `node:` prefix for builtins | Low | S3.3 |
| `turbo.json` | Add test pipeline with `cache: false` | Low | S5.1 |
| Root `package.json` | Add Vitest + scripts | Low | S1, S5.2 |

---

## Implementation Plan

### Phase 1: Foundation Setup

**Dependencies:** None. This phase must be completed before any other phase.

#### 1. Add Vitest dependencies and root scripts
- [ ] Add `vitest` to root `package.json` devDependencies
- [ ] Add `@vitest/coverage-v8` (optional, no thresholds yet)
- [ ] Add root scripts: `"test": "turbo run test"`, `"test:watch": "turbo run test:watch"`

**Blocks:** Task 2 (base config requires Vitest installed)

#### 2. Create shared base config
- [ ] Create `vitest.base.ts` at repo root
- [ ] Configure: Node environment, ESM resolution, mock reset behavior

**Depends on:** Task 1

#### 3. Add per-project Vitest configs
- [ ] Create `apps/controller/vitest.config.ts`
- [ ] Create `apps/worker/vitest.config.ts`
- [ ] Include patterns: `src/**/*.test.ts`, `test/**/*.test.ts`
- [ ] Add `test` and `test:watch` scripts to each package.json
- [ ] Create `test/setup.ts` in each app with `afterEach` resets

**Depends on:** Task 2

#### 4. Wire Turborepo test pipeline
- [ ] Update `turbo.json` — add `test` and `test:watch` tasks with `"cache": false`

**Depends on:** Task 1 and 3

---

### Phase 2: Testkit Package

**Dependencies:** Phase 1 (Vitest configs must exist before creating testkit package with its own config)

#### 5. Create testkit package skeleton
- [ ] Create `packages/testkit/package.json` with name `@auxbot/testkit`
- [ ] Create `packages/testkit/src/index.ts`
- [ ] Create `packages/testkit/vitest.config.ts`
- [ ] Create `packages/testkit/tsconfig.json`

**Blocks:** Task 6 (implement mocks in the skeleton structure)

#### 6. Implement testkit mocks
- [ ] Create `packages/testkit/src/mocks/k8s.ts` — mock `CoreV1Api` factory
- [ ] Create `packages/testkit/src/mocks/grpc-client.ts` — mock gRPC client functions
- [ ] Create `packages/testkit/src/helpers/index.ts` — `flushPromises()`, `waitFor()`, etc.
- [ ] Export all from `index.ts`

**Depends on:** Task 5

---

### Phase 3: Adapter Refactoring

**Dependencies:** Phase 1 (Vitest configs exist). Tasks 7 and 8 can be done in parallel.

#### 7. Refactor Controller K8s module
- [ ] Modify `apps/controller/src/k8s.ts`
  - Convert to lazy singleton pattern
  - Add `setCoreV1Api()` and `resetCoreV1Api()`
  - No client created at import-time
- [ ] Modify `apps/controller/src/registry/worker-registry.ts`
  - Accept optional `k8sApi` in constructor
  - Move `loadExistingWorkers()` + `startHealthChecks()` to `init()` method
- [ ] Update imports to use `node:` prefix where applicable

**Blocks:** Phase 4 (tests need K8s adapters refactored)

#### 8. Refactor Player for testability
- [ ] Modify `apps/worker/src/player.ts`
  - Export `createPlayer(deps)` factory
  - Keep `player` singleton export for production
  - Wrap `process.exit()` in injectable function
- [ ] Update imports to use `node:child_process`, `node:fs`

**Blocks:** Phase 4 (tests need player factory)

---

### Phase 4: Example Tests

**Dependencies:** Phase 2 (testkit package exists) and Phase 3 (adapters refactored). All tests can be created in parallel.

#### 9. Add tests
- [ ] Create `apps/worker/src/queue.test.ts`
  - Test `add()`, `pop()`, `clear()` methods
- [ ] Create `apps/controller/src/registry/worker-registry.test.ts`
  - Test `registerWorker()`, `getWorkersByGuild()`, `cleanupWorker()`
  - Use mock K8s client, no real API calls
- [ ] Create `apps/controller/test/spawn-worker.test.ts`
  - Use `setCoreV1Api()` with mock from `@auxbot/testkit`
  - Test `spawnWorkerPod()` flow
- [ ] Create `apps/worker/test/player-lifecycle.test.ts`
  - Use `createPlayer()` factory with mocked deps
  - Use `vi.useFakeTimers()` for inactivity timeout
  - Use `vi.mock('node:child_process')` for spawn

**Depends on:** Phases 2 and 3

---

### Phase 5: Documentation

**Dependencies:** Phases 1-4 (all features documented). Task 11 depends on Task 10.

#### 10. Create TESTING.md
- [ ] Create `TESTING.md` at repo root
- [ ] Document:
  - File naming conventions (`*.test.ts`)
  - Directory layout (`src/` colocated, `test/` for larger suites)
  - Commands (`pnpm test`, filtered, watch)
  - Mocking recipes with examples
  - How to add new mocks to testkit

#### 11. Update AGENTS.md
- [ ] Add test commands: `pnpm test`, `pnpm --filter <pkg> test`

**Depends on:** Task 10 (commands should match TESTING.md)

---

### Phase 6: Validation

**Dependencies:** All previous phases must be complete before validation. Tasks are sequential.

#### 12. Verify all acceptance criteria
- [ ] Run `pnpm test` — all tests pass
- [ ] Run `pnpm --filter @auxbot/controller test` — filtered execution works
- [ ] Run `pnpm --filter @auxbot/worker test:watch` — watch mode works
- [ ] Confirm no test triggers real `process.exit()`, K8s, or Discord calls

**Depends on:** Phases 1-5

---

## Troubleshooting

### Tests not finding mocks
- **Symptom:** Tests fail with "module not found" or mock functions are undefined
- **Cause:** Mocks not properly exported from testkit or vi.mock() not at top of file
- **Fix:** Ensure mocks are exported from testkit index.ts and vi.mock() is at file root (outside describe())

### Tests triggering real API calls
- **Symptom:** Tests fail with network errors or unexpected K8s/Discord activity
- **Cause:** Forgot to call reset functions or setter before test runs
- **Fix:** Add `afterEach(() => { resetCoreV1Api(); resetMockPlayerClient(); })` to test/setup.ts

### Import errors with `node:` prefix
- **Symptom:** "Cannot find module 'node:fs'" or similar errors
- **Cause:** Using `node:` prefix in Vitest config or incorrect module resolution
- **Fix:** Ensure Vitest environment is "node" and types are correct; vi.mock() uses same specifier as import

### Turborepo cache causing flaky tests
- **Symptom:** Tests pass in watch mode but fail in CI or vice versa
- **Cause:** Test cache not disabled or stale cache
- **Fix:** Verify `turbo.json` has `"cache": false` for test tasks

### Timer-related test flakiness
- **Symptom:** Timeout-based tests fail intermittently
- **Cause:** Real timers instead of fake timers
- **Fix:** Add `vi.useFakeTimers()` in beforeEach, `vi.useRealTimers()` in afterEach

### Circular dependency errors
- **Symptom:** "Dependency cycle detected" or similar errors
- **Cause:** Testkit imports from apps/* or apps import from each other incorrectly
- **Fix:** Ensure testkit only imports from node_modules, not apps/; check pnpm-workspace.yaml

### Resources
- [Vitest documentation](https://vitest.dev/)
- [Turborepo documentation](https://turbo.build/repo/docs)
- [Auxbot AGENTS.md](./AGENTS.md) for project-specific conventions
