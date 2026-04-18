import { afterEach, vi } from 'vitest';
import { resetMockDiscord, resetMockSentry, resetMockPlayerClient, resetMockHealthClient, resetMockWorkerLifecycleClient, resetCoreV1Api } from '@auxbot/testkit';

afterEach(() => {
  vi.clearAllMocks();
  resetMockDiscord();
  resetMockSentry();
  resetMockPlayerClient();
  resetMockHealthClient();
  resetMockWorkerLifecycleClient();
  resetCoreV1Api();
});
