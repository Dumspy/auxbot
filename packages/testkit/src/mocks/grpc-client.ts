import { vi } from 'vitest';

interface MockPlayerClient {
  addSong: ReturnType<typeof vi.fn>;
  skipSong: ReturnType<typeof vi.fn>;
  pauseSong: ReturnType<typeof vi.fn>;
  resumeSong: ReturnType<typeof vi.fn>;
  queueSong: ReturnType<typeof vi.fn>;
  clearQueue: ReturnType<typeof vi.fn>;
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
