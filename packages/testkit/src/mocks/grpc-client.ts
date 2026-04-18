import { vi, type Mock } from "vitest";

export interface MockPlayerClient {
  addSong: Mock;
  skipSong: Mock;
  pauseSong: Mock;
  resumeSong: Mock;
  queueSong: Mock;
  clearQueue: Mock;
}

let mockPlayerClient: MockPlayerClient | null = null;

export function createMockPlayerClient(): MockPlayerClient {
  return {
    addSong: vi.fn().mockResolvedValue({ success: true }),
    skipSong: vi.fn().mockResolvedValue({ success: true }),
    pauseSong: vi.fn().mockResolvedValue({ success: true }),
    resumeSong: vi.fn().mockResolvedValue({ success: true }),
    queueSong: vi.fn().mockResolvedValue({ success: true }),
    clearQueue: vi.fn().mockResolvedValue({ success: true }),
  };
}

export function getMockPlayerClient(): MockPlayerClient {
  if (!mockPlayerClient) {
    mockPlayerClient = createMockPlayerClient();
  }
  return mockPlayerClient;
}

export function setMockPlayerClient(client: MockPlayerClient): void {
  mockPlayerClient = client;
}

export function resetMockPlayerClient(): void {
  mockPlayerClient = null;
}

// Health Mock
export interface MockHealthClient {
  check: Mock;
}

export function createMockHealthClient(): MockHealthClient {
  return {
    check: vi.fn((_req, callback) => callback(null, { status: 1 })), // SERVING = 1
  };
}

let mockHealthClient: MockHealthClient | null = null;

export function getMockHealthClient(): MockHealthClient {
  if (!mockHealthClient) {
    mockHealthClient = createMockHealthClient();
  }
  return mockHealthClient;
}

export function resetMockHealthClient(): void {
  mockHealthClient = null;
}

// Worker Lifecycle Mock
export interface MockWorkerLifecycleClient {
  notifyShutdown: Mock;
}

export function createMockWorkerLifecycleClient(): MockWorkerLifecycleClient {
  return {
    notifyShutdown: vi.fn((_req, callback) => callback(null, { acknowledged: true })),
  };
}

let mockWorkerLifecycleClient: MockWorkerLifecycleClient | null = null;

export function getMockWorkerLifecycleClient(): MockWorkerLifecycleClient {
  if (!mockWorkerLifecycleClient) {
    mockWorkerLifecycleClient = createMockWorkerLifecycleClient();
  }
  return mockWorkerLifecycleClient;
}

export function resetMockWorkerLifecycleClient(): void {
  mockWorkerLifecycleClient = null;
}
