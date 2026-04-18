import { vi, type Mock } from 'vitest';

export interface MockDiscord {
  getClient: Mock;
  initClient: Mock;
  boot: Mock;
}

export function createMockDiscord(): MockDiscord {
  const mockClient = {
    login: vi.fn().mockResolvedValue('token'),
    destroy: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    guilds: {
      cache: {
        get: vi.fn(),
      },
    },
    user: {
      id: '123456789',
      tag: 'Bot#1234',
    },
  };

  return {
    getClient: vi.fn(() => mockClient),
    initClient: vi.fn().mockResolvedValue(mockClient),
    boot: vi.fn().mockResolvedValue(undefined),
  };
}

let mockDiscord: MockDiscord | null = null;

export function getMockDiscord(): MockDiscord {
  if (!mockDiscord) {
    mockDiscord = createMockDiscord();
  }
  return mockDiscord;
}

export function resetMockDiscord(): void {
  mockDiscord = null;
}
