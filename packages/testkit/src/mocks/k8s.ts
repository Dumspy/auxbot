import type { CoreV1Api } from '@kubernetes/client-node';
import { vi } from 'vitest';

export function createMockCoreV1Api(): CoreV1Api {
  return {
    createNamespacedPod: vi.fn().mockResolvedValue({ body: { metadata: { name: 'test-pod' } } }),
    deleteNamespacedPod: vi.fn().mockResolvedValue({ body: {} }),
    listNamespacedPod: vi.fn().mockResolvedValue({ body: { items: [] } }),
    readNamespacedPod: vi.fn().mockResolvedValue({ body: { metadata: { name: 'test-pod' } } }),
    patchNamespacedPod: vi.fn().mockResolvedValue({ body: {} }),
  } as any;
}
