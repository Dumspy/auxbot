import { describe, it, expect, vi } from 'vitest';
import { createMockCoreV1Api, flushPromises, waitFor } from '../src/index.js';

describe('Testkit', () => {
  describe('createMockCoreV1Api', () => {
    it('should create mock K8s API', () => {
      const mockApi = createMockCoreV1Api();

      expect(mockApi.createNamespacedPod).toBeDefined();
      expect(mockApi.deleteNamespacedPod).toBeDefined();
      expect(mockApi.listNamespacedPod).toBeDefined();
      expect(mockApi.readNamespacedPod).toBeDefined();
      expect(mockApi.patchNamespacedPod).toBeDefined();
    });

    it('should resolve with mock response', async () => {
      const mockApi = createMockCoreV1Api();

      const result = await mockApi.createNamespacedPod({} as any);

      expect(result).toBeDefined();
    });
  });

  describe('flushPromises', () => {
    it('should flush pending promises', async () => {
      let resolved = false;
      Promise.resolve().then(() => { resolved = true; });

      expect(resolved).toBe(false);
      await flushPromises();
      expect(resolved).toBe(true);
    });
  });

  describe('waitFor', () => {
    it('should wait for condition to be true', async () => {
      let count = 0;
      const condition = () => {
        count++;
        return count >= 3 ? 'done' : undefined;
      };

      const result = await waitFor(condition);

      expect(result).toBe('done');
      expect(count).toBe(3);
    });

    it('should timeout if condition never met', async () => {
      const condition = () => undefined;

      await expect(waitFor(condition, { timeout: 100, interval: 50 }))
        .rejects.toThrow('Condition not met within 100ms');
    });
  });
});
