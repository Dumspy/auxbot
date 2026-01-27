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
