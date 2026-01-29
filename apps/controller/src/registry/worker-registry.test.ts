import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkerRegistry } from './worker-registry.js';
import { createMockCoreV1Api } from '@auxbot/testkit';
import * as k8s from '@kubernetes/client-node';

vi.mock('../grpc/client/health.js', () => ({
  checkWorkerHealth: vi.fn().mockResolvedValue(true),
}));

describe('WorkerRegistry', () => {
  let mockK8sApi: k8s.CoreV1Api;
  let registry: WorkerRegistry;

  beforeEach(() => {
    mockK8sApi = createMockCoreV1Api();
    registry = new WorkerRegistry({ k8sApi: mockK8sApi });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should register a new worker', async () => {
    const pod = {
      metadata: { name: 'worker-123' },
    } as k8s.V1Pod;

    const service = {
      metadata: { name: 'worker-123' },
    } as k8s.V1Service;

    (mockK8sApi.listNamespacedService as any).mockResolvedValue({
      items: [service],
    });

    await registry.registerWorker(pod, 'guild1', 'channel1');

    const worker = registry.getWorker('worker-123');
    expect(worker).toBeDefined();
    expect(worker?.guildId).toBe('guild1');
    expect(worker?.channelId).toBe('channel1');
  });

  it('should get workers by guild', async () => {
    const pod1 = { metadata: { name: 'worker-1' } } as k8s.V1Pod;
    const pod2 = { metadata: { name: 'worker-2' } } as k8s.V1Pod;

    const service1 = {
      metadata: {
        name: 'worker-1',
        labels: { 'discord-guild-id': 'guild1' },
      },
    } as k8s.V1Service;
    const service2 = {
      metadata: {
        name: 'worker-2',
        labels: { 'discord-guild-id': 'guild2' },
      },
    } as k8s.V1Service;

    (mockK8sApi.listNamespacedService as any)
      .mockResolvedValueOnce({ items: [service1] })
      .mockResolvedValueOnce({ items: [service2] });

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
    const pod = {
      metadata: { name: 'worker-123' },
    } as k8s.V1Pod;
    const service = {
      metadata: { name: 'worker-123' },
    } as k8s.V1Service;

    (mockK8sApi.listNamespacedService as any).mockResolvedValue({
      items: [service],
    });

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
