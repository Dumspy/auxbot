import { sendUnaryData, ServerUnaryCall } from '@grpc/grpc-js';
import { WorkerLifecycleServer, WorkerLifecycleRequest, WorkerLifecycleResponse, WorkerLifecycleService } from '@auxbot/protos/worker_lifecycle';
import { workerRegistry } from '../../k8s.js';
import { registerService } from '../index.js';

registerService<WorkerLifecycleService, WorkerLifecycleServer>(
  WorkerLifecycleService,
  {
    notifyShutdown: async function (call: ServerUnaryCall<WorkerLifecycleRequest, WorkerLifecycleResponse>, callback: sendUnaryData<WorkerLifecycleResponse>): Promise<void> {
      const { guildId, reason } = call.request;
      console.log(`Received worker lifecycle notification from guild ${guildId}, reason: ${reason}`);

      // Find the worker for this guild
      const workers = workerRegistry.getWorkersByGuild(guildId);
      if (workers.length === 0) {
        console.warn(`No worker found for guild ${guildId} during lifecycle notification`);
        callback(null, { acknowledged: false });
        return;
      }

      const [worker] = workers;
      const podName = worker?.pod.metadata?.name;

      if (!podName) {
        console.error(`Worker found for guild ${guildId} but pod name is missing`);
        callback(null, { acknowledged: false });
        return;
      }

      try {
        // Clean up the worker resources
        await workerRegistry.cleanupWorker(podName);
        callback(null, { acknowledged: true });
      } catch (error) {
        console.error(`Error cleaning up worker for guild ${guildId}:`, error);
        callback(null, { acknowledged: false });
      }
    }
  }
);