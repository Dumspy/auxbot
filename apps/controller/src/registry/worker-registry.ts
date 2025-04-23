import * as k8s from '@kubernetes/client-node';
import { env } from '../env.js';
import { checkWorkerHealth } from '../grpc/health.js';

// Interface to represent a tracked worker
interface TrackedWorker {
  deployment: k8s.V1Deployment;
  service: k8s.V1Service;
  guildId: string;
  channelId: string;
  healthy: boolean;
  lastChecked: Date;
}

export class WorkerRegistry {
  private workers: Map<string, TrackedWorker> = new Map();
  private k8sApi: k8s.CoreV1Api;
  private appsApi: k8s.AppsV1Api;

  constructor() {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    this.appsApi = kc.makeApiClient(k8s.AppsV1Api);
    
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
  async registerWorker(deployment: k8s.V1Deployment, guildId: string, channelId: string): Promise<void> {
    const deploymentName = deployment.metadata?.name || 'unknown';

    // Find the associated service
    const services = await this.k8sApi.listNamespacedService({
      namespace: env.K8S_NAMESPACE,
      labelSelector: `app=worker,discord-guild-id=${guildId}`
    });

    const service = services.items[0];
    if (!service) {
      throw new Error(`No service found for worker ${deploymentName} (guild: ${guildId})`);
    }

    this.workers.set(deploymentName, {
      deployment,
      service,
      guildId,
      channelId,
      healthy: false,
      lastChecked: new Date()
    });
    
    console.log(`Registered worker deployment ${deploymentName} and service ${service.metadata?.name} for guild ${guildId}, channel ${channelId}`);
  }

  /**
   * Get information about a worker
   */
  getWorker(deploymentName: string): TrackedWorker | undefined {
    return this.workers.get(deploymentName);
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
  unregisterWorker(deploymentName: string): void {
    this.workers.delete(deploymentName);
    console.log(`Unregistered worker deployment ${deploymentName}`);
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
      for (const [deploymentName, worker] of this.workers.entries()) {
        await this.checkWorkerHealth(deploymentName);
      }
    }, 30000);
  }

  /**
   * Check the health of a specific worker
   */
  async checkWorkerHealth(deploymentName: string): Promise<boolean> {
    const worker = this.workers.get(deploymentName);
    if (!worker) {
      console.log(`Worker ${deploymentName} not found for health check`);
      return false;
    }

    try {
      // Use the worker's service DNS name to check health via gRPC
      const address = this.getWorkerServiceDns(worker.guildId);
      const isHealthy = await checkWorkerHealth(address);
      
      worker.healthy = isHealthy;
      worker.lastChecked = new Date();
      
      console.log(`Health check for worker ${deploymentName}: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);
      return isHealthy;
    } catch (error) {
      console.error(`Error checking health for worker ${deploymentName}:`, error);
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
      // Get all deployments with the app=worker label in our namespace
      const deployments = await this.appsApi.listNamespacedDeployment({
        namespace: env.K8S_NAMESPACE,
        labelSelector: 'app=worker'
      });

      console.log(`Found ${deployments.items.length} worker deployments in the cluster`);

      // Process each deployment
      for (const deployment of deployments.items) {
        const deploymentName = deployment.metadata?.name;
        if (!deploymentName) continue;

        // Extract guild ID and channel ID from deployment labels or annotations
        const guildId = deployment.metadata?.labels?.['discord-guild-id'] || 
                       deployment.metadata?.annotations?.['discord-guild-id'];
        const channelId = deployment.metadata?.labels?.['discord-channel-id'] || 
                         deployment.metadata?.annotations?.['discord-channel-id'];

        if (guildId && channelId) {
          // Find the associated service
          const services = await this.k8sApi.listNamespacedService({
            namespace: env.K8S_NAMESPACE,
            labelSelector: `app=worker,discord-guild-id=${guildId}`
          });

          const service = services.items[0];
          if (!service) {
            console.warn(`No service found for worker ${deploymentName} (guild: ${guildId})`);
            continue;
          }

          // Register this worker with both deployment and service
          this.workers.set(deploymentName, {
            deployment,
            service,
            guildId,
            channelId,
            healthy: false,
            lastChecked: new Date()
          });

          console.log(`Loaded existing worker deployment ${deploymentName} and service ${service.metadata?.name} for guild ${guildId}, channel ${channelId}`);
        } else {
          console.warn(`Found worker deployment ${deploymentName} without guild ID or channel ID labels/annotations`);
        }
      }
    } catch (error) {
      console.error('Error loading existing workers:', error);
      throw error;
    }
  }
}