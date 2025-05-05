import * as k8s from '@kubernetes/client-node';
import { env } from '../env.js';
import { checkWorkerHealth } from '../grpc/client/health.js';

// Interface to represent a tracked worker
interface TrackedWorker {
  pod: k8s.V1Pod;  // Changed from deployment to pod
  service: k8s.V1Service;
  guildId: string;
  channelId: string;
  healthy: boolean;
  lastChecked: Date;
  ready: boolean; // New field to track worker readiness
}

export class WorkerRegistry {
  private workers: Map<string, TrackedWorker> = new Map();
  private k8sApi: k8s.CoreV1Api;

  constructor() {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    
    // Load existing workers on startup
    this.loadExistingWorkers().then(() => {
      console.log('Loaded existing workers');
      // Start periodic health checks
      this.startHealthChecks();
    }).catch(error => {
      console.error('Failed to load existing workers:', error);
      // Start periodic health checks anyway
      this.startHealthChecks();
    });
  }

  /**
   * Register a new worker
   */
  async registerWorker(pod: k8s.V1Pod, guildId: string, channelId: string): Promise<void> {
    const podName = pod.metadata?.name || 'unknown';

    // Find the associated service
    const services = await this.k8sApi.listNamespacedService({
      namespace: env.K8S_NAMESPACE,
      labelSelector: `app=worker,discord-guild-id=${guildId}`
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
      ready: false // Initialize as not ready
    });
    
    console.log(`Registered worker pod ${podName} and service ${service.metadata?.name} for guild ${guildId}, channel ${channelId}`);
  }

  /**
   * Get information about a worker
   */
  getWorker(podName: string): TrackedWorker | undefined {
    return this.workers.get(podName);
  }

  /**
   * Get all workers for a guild
   */
  getWorkersByGuild(guildId: string): TrackedWorker[] {
    return Array.from(this.workers.values())
      .filter(worker => worker.guildId === guildId);
  }

  /**
   * Remove a worker from tracking
   */
  unregisterWorker(podName: string): void {
    this.workers.delete(podName);
    console.log(`Unregistered worker pod ${podName}`);
  }

  /**
   * Get the service DNS name for a worker
   */
  private getWorkerServiceDns(guildId: string): string {
    return `auxbot-worker-${guildId}.${env.K8S_NAMESPACE}.svc.cluster.local:50051`;
  }

  /**
   * Start periodic health checks for all workers
   */
  private startHealthChecks(): void {
    // Check all workers every 30 seconds
    setInterval(async () => {
      for (const [podName, worker] of this.workers.entries()) {
        if (worker.ready) { // Only check health if the worker is ready
          await this.checkWorkerHealth(podName);
        }
      }
    }, 30000);
  }

  /**
   * Check the health of a specific worker
   */
  async checkWorkerHealth(podName: string): Promise<boolean> {
    const worker = this.workers.get(podName);
    if (!worker) {
      console.log(`Worker ${podName} not found for health check`);
      return false;
    }

    try {
      // Use the worker's service DNS name to check health via gRPC
      const address = this.getWorkerServiceDns(worker.guildId);
      const isHealthy = await checkWorkerHealth(address);
      
      worker.healthy = isHealthy;
      worker.lastChecked = new Date();
      
      console.log(`Health check for worker ${podName}: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);
      return isHealthy;
    } catch (error) {
      console.error(`Error checking health for worker ${podName}:`, error);
      worker.healthy = false;
      worker.lastChecked = new Date();
      return false;
    }
  }

  /**
   * Get all currently tracked workers
   */
  getAllWorkers(): TrackedWorker[] {
    return Array.from(this.workers.values());
  }

  /**
   * Load existing worker deployments from Kubernetes
   */
  private async loadExistingWorkers(): Promise<void> {
    try {
      // Get all pods with the app=worker label in our namespace
      const pods = await this.k8sApi.listNamespacedPod({
        namespace: env.K8S_NAMESPACE,
        labelSelector: 'app=worker'
      });

      console.log(`Found ${pods.items.length} worker pods in the cluster`);

      // Process each pod
      for (const pod of pods.items) {
        const podName = pod.metadata?.name;
        if (!podName) continue;

        // Extract guild ID and channel ID from pod labels
        const guildId = pod.metadata?.labels?.['discord-guild-id'];
        const channelId = pod.metadata?.labels?.['discord-channel-id'];

        if (guildId && channelId) {
          // Find the associated service
          const services = await this.k8sApi.listNamespacedService({
            namespace: env.K8S_NAMESPACE,
            labelSelector: `app=worker,discord-guild-id=${guildId}`
          });

          const service = services.items[0];
          if (!service) {
            console.warn(`No service found for worker ${podName} (guild: ${guildId})`);
            continue;
          }

          // Register this worker with both pod and service
          this.workers.set(podName, {
            pod,
            service,
            guildId,
            channelId,
            healthy: false,
            lastChecked: new Date(),
            ready: false // Initialize as not ready
          });

          console.log(`Loaded existing worker pod ${podName} and service ${service.metadata?.name} for guild ${guildId}, channel ${channelId}`);
        } else {
          console.warn(`Found worker pod ${podName} without guild ID or channel ID labels`);
        }
      }
    } catch (error) {
      console.error('Error loading existing workers:', error);
      throw error;
    }
  }

  /**
   * Clean up a worker's resources and unregister it
   */
  async cleanupWorker(podName: string): Promise<void> {
    const worker = this.workers.get(podName);
    if (!worker) {
      throw new Error(`Worker ${podName} not found for cleanup`);
    }

    try {
      // Clean up the pod and service
      await this.k8sApi.deleteNamespacedPod({
        name: podName,
        namespace: env.K8S_NAMESPACE
      });
      await this.k8sApi.deleteNamespacedService({
        name: podName,
        namespace: env.K8S_NAMESPACE
      });

      // Unregister the worker
      this.unregisterWorker(podName);
      console.log(`Cleaned up resources for worker ${podName}`);
    } catch (error) {
      console.error(`Error cleaning up worker ${podName}:`, error);
      throw error;
    }
  }

  /**
   * Mark a worker as ready
   */
  markWorkerAsReady(podName: string): void {
    const worker = this.workers.get(podName);
    if (worker) {
      worker.ready = true;
      console.log(`Worker ${podName} marked as ready`);
    } else {
      console.warn(`Worker ${podName} not found to mark as ready`);
    }
  }
}
