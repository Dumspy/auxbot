import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkerRegistry } from './worker-registry.js';
import { createMockCoreV1Api, createMockPod, createMockService, createMockServiceList } from '@auxbot/testkit';
import type { CoreV1Api } from '@kubernetes/client-node';

vi.mock('../grpc/client/health.js', () => ({
  checkWorkerHealth: vi.fn().mockResolvedValue(true),
}));

describe('WorkerRegistry', () => {
  let mockK8sApi: CoreV1Api;
  let registry: WorkerRegistry;

  beforeEach(() => {
    mockK8sApi = createMockCoreV1Api();
    registry = new WorkerRegistry({ k8sApi: mockK8sApi });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should register a new worker', async () => {
    const pod = createMockPod('worker-123');
    const service = createMockService('worker-123');
    const mockList = vi.mocked(mockK8sApi.listNamespacedService);
    mockList.mockResolvedValue(createMockServiceList([service]));

    await registry.registerWorker(pod, 'guild1', 'channel1');

    const worker = registry.getWorker('worker-123');
    expect(worker).toBeDefined();
    expect(worker?.guildId).toBe('guild1');
    expect(worker?.channelId).toBe('channel1');
  });

  it('should get workers by guild', async () => {
    const pod1 = createMockPod('worker-1');
    const pod2 = createMockPod('worker-2');
    const service1 = createMockService('worker-1', 'guild1');
    const service2 = createMockService('worker-2', 'guild2');

    const mockList = vi.mocked(mockK8sApi.listNamespacedService);
    mockList
      .mockResolvedValueOnce(createMockServiceList([service1]))
      .mockResolvedValueOnce(createMockServiceList([service2]));

    await registry.registerWorker(pod1, 'guild1', 'channel1');
    await registry.registerWorker(pod2, 'guild2', 'channel2');

    const guild1Workers = registry.getWorkersByGuild('guild1');
    const guild2Workers = registry.getWorkersByGuild('guild2');

    expect(guild1Workers).toHaveLength(1);
    expect(guild1Workers[0]?.guildId).toBe('guild1');
    expect(guild2Workers).toHaveLength(1);
    expect(guild2Workers[0]?.guildId).toBe('guild2');
  });

  it('should cleanup worker resources', async () => {
    const pod = createMockPod('worker-123');
    const service = createMockService('worker-123');
    const mockList = vi.mocked(mockK8sApi.listNamespacedService);
    mockList.mockResolvedValue(createMockServiceList([service]));

    await registry.registerWorker(pod, 'guild1', 'channel1');

    await registry.cleanupWorker('worker-123');

    expect(mockK8sApi.deleteNamespacedPod).toHaveBeenCalledWith({
      name: 'worker-123',
      namespace: 'auxbot',
    });
    expect(mockK8sApi.deleteNamespacedService).toHaveBeenCalledWith({
      name: 'worker-123',
      namespace: 'auxbot',
    });
    expect(registry.getWorker('worker-123')).toBeUndefined();
  });
});
