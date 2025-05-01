import { credentials } from '@grpc/grpc-js';
import { WorkerLifecycleClient, WorkerLifecycleResponse } from '@auxbot/protos/worker_lifecycle';
import { env } from '../../env.js';

const client = new WorkerLifecycleClient(
  `controller:${env.GRPC_PORT}`,
  credentials.createInsecure()
);

export const notifyShutdown = async (reason: string): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    client.notifyShutdown(
      { guildId: env.DISCORD_GUILD_ID, reason },
      (error: Error | null, response: WorkerLifecycleResponse) => {
        if (error) {
          console.error('Error notifying controller of shutdown:', error);
          resolve(false);
          return;
        }
        resolve(response.acknowledged);
      }
    );
  });
};