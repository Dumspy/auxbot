import { credentials } from '@grpc/grpc-js';
import { WorkerLifecycleClient, WorkerLifecycleResponse, WorkerReadyResponse } from '@auxbot/protos/worker_lifecycle';
import { env } from '../../env.js';
import { captureException } from '@auxbot/sentry';

const client = new WorkerLifecycleClient(
  `auxbot-controller.${env.K8S_NAMESPACE}.svc.cluster.local:50051`,
  credentials.createInsecure()
);

export const notifyShutdown = async (reason: string): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    client.notifyShutdown(
      { guildId: env.DISCORD_GUILD_ID, reason },
      (error: Error | null, response: WorkerLifecycleResponse) => {
        if (error) {
          captureException(error, {
            tags: {
              reason,
            },
          });
          return resolve(false);
        }
        resolve(response.acknowledged);
      }
    );
  });
};

export const notifyReady = async (guildId: string): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    client.notifyReady(
      { guildId },
      (error: Error | null, response: WorkerReadyResponse) => {
        if (error) {
          captureException(error, {
            tags: {
              guildId,
            },
          });
          return resolve(false);
        }
        resolve(response.acknowledged);
      }
    );
  });
};
