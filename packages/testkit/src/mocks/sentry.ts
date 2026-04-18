import { vi, type Mock } from 'vitest';

export interface MockSentry {
  initSentry: Mock;
  captureException: Mock;
  flush: Mock;
}

export function createMockSentry(): MockSentry {
  return {
    initSentry: vi.fn(),
    captureException: vi.fn(),
    flush: vi.fn().mockResolvedValue(true),
  };
}

let mockSentry: MockSentry | null = null;

export function getMockSentry(): MockSentry {
  if (!mockSentry) {
    mockSentry = createMockSentry();
  }
  return mockSentry;
}

export function resetMockSentry(): void {
  mockSentry = null;
}
