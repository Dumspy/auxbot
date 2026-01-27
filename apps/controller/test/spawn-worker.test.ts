import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawnWorkerPod } from '../spawn-worker.js';
import { setCoreV1Api, resetCoreV1Api, createMockCoreV1Api } from '@auxbot/testkit';
import * as k8s from '@kubernetes/client-node';
import { env } from '../env.js';

vi.mock('../env.js', () => ({
  env: { K8S_NAMESPACE: 'auxbot' },
}));

vi.mock('../jobs/worker.js', () => ({
  createWorkerResources: vi.fn(() => ({
    pod: {
      metadata: { name: 'worker-123', labels: {} },
    },
    service: {
      metadata: {
        name: 'worker-123',
        ownerReferences: [{ uid: 'test-uid' }],
      },
    },
  })),
}));

describe('spawnWorkerPod', () => {
  let mockK8sApi: k8s.CoreV1Api;

  beforeEach(() => {
    mockK8sApi = createMockCoreV1Api();
    setCoreV1Api(mockK8sApi);
  });

  afterEach(() => {
    resetCoreV1Api();
    vi.clearAllMocks();
  });

  it('should create new worker pod and service', async () => {
    (mockK8sApi.createNamespacedPod as any).mockResolvedValue({
      body: { metadata: { name: 'worker-123', uid: 'test-uid' } },
    });

    const podName = await spawnWorkerPod('guild1', 'channel1');

    expect(podName).toBe('worker-123');
    expect(mockK8sApi.createNamespacedPod).toHaveBeenCalledWith({
      namespace: 'auxbot',
      body: expect.any(Object),
    });
    expect(mockK8sApi.createNamespacedService).toHaveBeenCalledWith({
      namespace: 'auxbot',
      body: expect.any(Object),
    });
  });

  it('should return existing worker if already exists', async () => {
    const existingPod = {
      metadata: { name: 'existing-worker' },
    } as k8s.V1Pod;
    const existingService = {
      metadata: { name: 'existing-worker' },
    } as k8s.V1Service;

    (mockK8sApi.listNamespacedPod as any).mockResolvedValue({
      body: {
        items: [
          {
            metadata: {
              name: 'existing-worker',
              labels: { 'app': 'worker', 'discord-guild-id': 'guild1' },
            },
          },
        ],
      },
    });
    (mockK8sApi.listNamespacedService as any).mockResolvedValue({
      body: { items: [existingService] },
    });

    const podName = await spawnWorkerPod('guild1', 'channel1');

    expect(podName).toBe('existing-worker');
    expect(mockK8sApi.createNamespacedPod).not.toHaveBeenCalled();
  });
});
