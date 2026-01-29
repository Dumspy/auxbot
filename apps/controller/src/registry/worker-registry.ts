import * as k8s from "@kubernetes/client-node";
import { env } from "../env.js";
import { checkWorkerHealth } from "../grpc/client/health.js";

export interface TrackedWorker {
  pod: k8s.V1Pod;
  service: k8s.V1Service;
  guildId: string;
  channelId: string;
  healthy: boolean;
  lastChecked: Date;
}

interface WorkerRegistryOptions {
  k8sApi?: k8s.CoreV1Api;
}

export class WorkerRegistry {
  private workers: Map<string, TrackedWorker> = new Map();
  private k8sApi: k8s.CoreV1Api;

  constructor(options: WorkerRegistryOptions = {}) {
    this.k8sApi = options.k8sApi || this.createDefaultK8sApi();
  }

  private createDefaultK8sApi(): k8s.CoreV1Api {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    return kc.makeApiClient(k8s.CoreV1Api);
  }

  async init(): Promise<void> {
    try {
      await this.loadExistingWorkers();
      console.log("Loaded existing workers");
      this.startHealthChecks();
    } catch (error) {
      console.error("Failed to load existing workers:", error);
      this.startHealthChecks();
    }
  }

  async registerWorker(pod: k8s.V1Pod, guildId: string, channelId: string): Promise<void> {
    const podName = pod.metadata?.name || "unknown";

    const services = await this.k8sApi.listNamespacedService({
      namespace: env.K8S_NAMESPACE,
      labelSelector: `app=worker,discord-guild-id=${guildId}`,
    });

    const service = services.items[0];
    if (!service) {
      throw new Error(`No service found for worker ${podName} (guild: ${guildId})`);
    }

    this.workers.set(podName, {
      pod,
      service,
      guildId,
      channelId,
      healthy: false,
      lastChecked: new Date(),
    });

    console.log(
      `Registered worker pod ${podName} and service ${service.metadata?.name} for guild ${guildId}, channel ${channelId}`,
    );
  }

  getWorker(podName: string): TrackedWorker | undefined {
    return this.workers.get(podName);
  }

  getWorkersByGuild(guildId: string): TrackedWorker[] {
    return Array.from(this.workers.values()).filter((worker) => worker.guildId === guildId);
  }

  unregisterWorker(podName: string): void {
    this.workers.delete(podName);
    console.log(`Unregistered worker pod ${podName}`);
  }

  private getWorkerServiceDns(guildId: string): string {
    return `auxbot-worker-${guildId}.${env.K8S_NAMESPACE}.svc.cluster.local:50051`;
  }

  private startHealthChecks(): void {
    setInterval(async () => {
      for (const [podName] of this.workers.entries()) {
        await this.checkWorkerHealth(podName);
      }
    }, 30000);
  }

  async checkWorkerHealth(podName: string): Promise<boolean> {
    const worker = this.workers.get(podName);
    if (!worker) {
      console.log(`Worker ${podName} not found for health check`);
      return false;
    }

    try {
      const address = this.getWorkerServiceDns(worker.guildId);
      const isHealthy = await checkWorkerHealth(address);

      worker.healthy = isHealthy;
      worker.lastChecked = new Date();

      console.log(`Health check for worker ${podName}: ${isHealthy ? "HEALTHY" : "UNHEALTHY"}`);
      return isHealthy;
    } catch (error) {
      console.error(`Error checking health for worker ${podName}:`, error);
      worker.healthy = false;
      worker.lastChecked = new Date();
      return false;
    }
  }

  getAllWorkers(): TrackedWorker[] {
    return Array.from(this.workers.values());
  }

  private async loadExistingWorkers(): Promise<void> {
    try {
      const pods = await this.k8sApi.listNamespacedPod({
        namespace: env.K8S_NAMESPACE,
        labelSelector: "app=worker",
      });

      console.log(`Found ${pods.items.length} worker pods in cluster`);

      for (const pod of pods.items) {
        const podName = pod.metadata?.name;
        if (!podName) continue;

        const guildId = pod.metadata?.labels?.["discord-guild-id"];
        const channelId = pod.metadata?.labels?.["discord-channel-id"];

        if (guildId && channelId) {
          const services = await this.k8sApi.listNamespacedService({
            namespace: env.K8S_NAMESPACE,
            labelSelector: `app=worker,discord-guild-id=${guildId}`,
          });

          const service = services.items[0];
          if (!service) {
            console.warn(`No service found for worker ${podName} (guild: ${guildId})`);
            continue;
          }

          this.workers.set(podName, {
            pod,
            service,
            guildId,
            channelId,
            healthy: false,
            lastChecked: new Date(),
          });

          console.log(
            `Loaded existing worker pod ${podName} and service ${service.metadata?.name} for guild ${guildId}, channel ${channelId}`,
          );
        } else {
          console.warn(`Found worker pod ${podName} without guild ID or channel ID labels`);
        }
      }
    } catch (error) {
      console.error("Error loading existing workers:", error);
      throw error;
    }
  }

  async cleanupWorker(podName: string): Promise<void> {
    const worker = this.workers.get(podName);
    if (!worker) {
      throw new Error(`Worker ${podName} not found for cleanup`);
    }

    try {
      await this.k8sApi.deleteNamespacedPod({
        name: podName,
        namespace: env.K8S_NAMESPACE,
      });
      await this.k8sApi.deleteNamespacedService({
        name: podName,
        namespace: env.K8S_NAMESPACE,
      });

      this.unregisterWorker(podName);
      console.log(`Cleaned up resources for worker ${podName}`);
    } catch (error) {
      console.error(`Error cleaning up worker ${podName}:`, error);
      throw error;
    }
  }
}

export const workerRegistry = new WorkerRegistry();
