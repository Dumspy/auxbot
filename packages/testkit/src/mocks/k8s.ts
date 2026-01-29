import type { CoreV1Api, V1Service } from '@kubernetes/client-node';
import { V1Pod, V1ServiceList } from '@kubernetes/client-node';
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
    listNamespacedService: vi.fn().mockResolvedValue({ body: { items: [] } }),
  } as unknown as CoreV1Api;
}

export function createMockPod(name: string, uid?: string): V1Pod {
  const pod = new V1Pod();
  pod.metadata = { name, uid };
  return pod;
}

export function createMockService(name: string, guildId?: string): V1Service {
  const metadata: import('@kubernetes/client-node').V1ObjectMeta = { name };
  if (guildId) {
    metadata.labels = { 'discord-guild-id': guildId };
  }
  return { metadata } as V1Service;
}

export function createMockServiceList(services: V1Service[]): V1ServiceList {
  const serviceList = new V1ServiceList();
  serviceList.items = services;
  return serviceList;
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
