import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawnWorkerPod } from '../src/spawn-worker.js';
import { setCoreV1Api, resetCoreV1Api } from '../src/k8s.js';
import { createMockCoreV1Api, createMockPod, createMockService, createMockServiceList } from '@auxbot/testkit';
import type { CoreV1Api } from '@kubernetes/client-node';
import { WorkerRegistry } from '../src/registry/worker-registry.js';

vi.mock('../src/jobs/worker.js', () => ({
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
  let mockK8sApi: CoreV1Api;

  beforeEach(() => {
    mockK8sApi = createMockCoreV1Api();
    setCoreV1Api(mockK8sApi);
  });

  afterEach(() => {
    resetCoreV1Api();
    vi.clearAllMocks();
  });

  it('should create new worker pod and service', async () => {
    const mockCreatePod = vi.mocked(mockK8sApi.createNamespacedPod);
    const mockListService = vi.mocked(mockK8sApi.listNamespacedService);

    const pod = createMockPod('worker-123', 'test-uid');
    mockCreatePod.mockResolvedValue(pod);
    mockListService.mockResolvedValue(createMockServiceList([createMockService('worker-123')]));

    const podName = await spawnWorkerPod('guild1', 'channel1');

    expect(podName).toBe('worker-123');
    expect(mockK8sApi.createNamespacedPod).toHaveBeenCalled();
    expect(mockK8sApi.createNamespacedService).toHaveBeenCalled();
  });

  it('should return existing worker if already exists', async () => {
    const existingPod = createMockPod('existing-worker');
    existingPod.metadata!.labels = {};
    const existingService = createMockService('existing-worker');

    vi.spyOn(WorkerRegistry.prototype, 'getWorkersByGuild').mockReturnValue([
      {
        pod: existingPod,
        service: existingService,
        guildId: 'guild1',
        channelId: 'channel1',
        healthy: false,
        lastChecked: new Date(),
      },
    ]);

    const podName = await spawnWorkerPod('guild1', 'channel1');

    expect(podName).toBe('existing-worker');
    expect(mockK8sApi.createNamespacedPod).not.toHaveBeenCalled();
  });
});
