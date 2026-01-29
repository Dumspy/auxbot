import type { CoreV1Api } from '@kubernetes/client-node';
import { vi } from 'vitest';

export function createMockCoreV1Api(): CoreV1Api {
  return {
    createNamespacedPod: vi.fn().mockResolvedValue({ body: { metadata: { name: 'test-pod' } } }),
    deleteNamespacedPod: vi.fn().mockResolvedValue({ body: {} }),
    listNamespacedPod: vi.fn().mockResolvedValue({ body: { items: [] } }),
    readNamespacedPod: vi.fn().mockResolvedValue({ body: { metadata: { name: 'test-pod' } } }),
    patchNamespacedPod: vi.fn().mockResolvedValue({ body: {} }),
    createNamespacedService: vi.fn().mockResolvedValue({ body: { metadata: { name: 'test-service' } } }),
    deleteNamespacedService: vi.fn().mockResolvedValue({ body: {} }),
    listNamespacedService: vi.fn().mockResolvedValue({ items: [] }),
  } as any;
}

let mockCoreV1Api: CoreV1Api | null = null;

export function setCoreV1Api(api: CoreV1Api): void {
  mockCoreV1Api = api;
}

export function resetCoreV1Api(): void {
  mockCoreV1Api = null;
}

export function getMockCoreV1Api(): CoreV1Api {
  if (!mockCoreV1Api) {
    throw new Error('Mock CoreV1Api not set. Call setCoreV1Api() first.');
  }
  return mockCoreV1Api;
}
