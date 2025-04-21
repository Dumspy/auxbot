import * as k8s from '@kubernetes/client-node';
import { env } from '../env.js';
import { checkWorkerHealth } from '../grpc/health.js';

// Interface to represent a tracked worker
interface TrackedWorker {
  job: k8s.V1Job;
  guildId: string;
  channelId: string;
  podIp?: string;
  healthy: boolean;
  lastChecked: Date;
}

export class WorkerRegistry {
  private workers: Map<string, TrackedWorker> = new Map();
  private k8sApi: k8s.CoreV1Api;
  private batchApi: k8s.BatchV1Api;

  constructor() {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    this.batchApi = kc.makeApiClient(k8s.BatchV1Api);
    
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
  registerWorker(job: k8s.V1Job, guildId: string, channelId: string): void {
    const jobName = job.metadata?.name || 'unknown';

    this.workers.set(jobName, {
      job,
      guildId,
      channelId,
      healthy: false,
      lastChecked: new Date()
    });
    
    console.log(`Registered worker job ${jobName} for guild ${guildId}, channel ${channelId}`);
    
    // Start tracking this worker's pod
    this.updateWorkerPodIp(jobName);
  }

  /**
   * Get information about a worker
   */
  getWorker(jobName: string): TrackedWorker | undefined {
    return this.workers.get(jobName);
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
  unregisterWorker(jobName: string): void {
    this.workers.delete(jobName);
    console.log(`Unregistered worker job ${jobName}`);
  }

  /**
   * Update the pod IP for a worker job
   */
  private async updateWorkerPodIp(jobName: string): Promise<void> {
    try {
      // Get the pod associated with this job
      const pods = await this.k8sApi.listNamespacedPod({
        namespace: env.K8S_NAMESPACE,
        labelSelector: `job-name=${jobName}`,
      });

      if (pods.items.length > 0 && pods.items[0]) {
        const podIp = pods.items[0].status?.podIP;
        if (podIp) {
          const worker = this.workers.get(jobName);
          if (worker) {
            worker.podIp = podIp;
            console.log(`Updated pod IP for worker ${jobName}: ${podIp}`);
          }
        }
      }
    } catch (error) {
      console.error(`Error updating pod IP for worker ${jobName}:`, error);
    }
  }

  /**
   * Start periodic health checks for all workers
   */
  private startHealthChecks(): void {
    // Check all workers every 30 seconds
    setInterval(async () => {
      for (const [jobName, worker] of this.workers.entries()) {
        await this.checkWorkerHealth(jobName);
      }
      
      // Also update pod IPs for workers that don't have them yet
      this.updateMissingPodIps();
    }, 30000);
  }

  /**
   * Update pod IPs for workers that don't have them yet
   */
  private async updateMissingPodIps(): Promise<void> {
    for (const [jobName, worker] of this.workers.entries()) {
      if (!worker.podIp) {
        await this.updateWorkerPodIp(jobName);
      }
    }
  }

  /**
   * Check the health of a specific worker
   */
  async checkWorkerHealth(jobName: string): Promise<boolean> {
    const worker = this.workers.get(jobName);
    if (!worker) {
      console.log(`Worker ${jobName} not found for health check`);
      return false;
    }

    // If we don't have a pod IP yet, we can't check health
    if (!worker.podIp) {
      console.log(`Worker ${jobName} has no pod IP, can't check health`);
      worker.healthy = false;
      worker.lastChecked = new Date();
      return false;
    }

    try {
      // Use the worker's pod IP to check health via gRPC
      const address = `${worker.podIp}:${env.WORKER_GRPC_PORT}`;
      const isHealthy = await checkWorkerHealth(address);
      
      worker.healthy = isHealthy;
      worker.lastChecked = new Date();
      
      console.log(`Health check for worker ${jobName}: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);
      return isHealthy;
    } catch (error) {
      console.error(`Error checking health for worker ${jobName}:`, error);
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
   * Load existing worker jobs from Kubernetes
   */
  private async loadExistingWorkers(): Promise<void> {
    try {
      // Get all jobs with the app=worker label in our namespace
      const jobs = await this.batchApi.listNamespacedJob(
        {
          namespace: env.K8S_NAMESPACE,
          labelSelector: 'app=worker'
        }
      );

      console.log(`Found ${jobs.items.length} worker jobs in the cluster`);

      // Process each job
      for (const job of jobs.items) {
        const jobName = job.metadata?.name;
        if (!jobName) continue;

        // Extract guild ID and channel ID from job labels or annotations
        const guildId = job.metadata?.labels?.['discord-guild-id'] || 
                        job.metadata?.annotations?.['discord-guild-id'];
        const channelId = job.metadata?.labels?.['discord-channel-id'] || 
                          job.metadata?.annotations?.['discord-channel-id'];

        if (guildId && channelId) {
          // Register this worker
          this.workers.set(jobName, {
            job,
            guildId,
            channelId,
            healthy: false,
            lastChecked: new Date()
          });

          console.log(`Loaded existing worker job ${jobName} for guild ${guildId}, channel ${channelId}`);
          
          // Try to get the pod IP right away
          await this.updateWorkerPodIp(jobName);
        } else {
          console.warn(`Found worker job ${jobName} without guild ID or channel ID labels/annotations`);
        }
      }
    } catch (error) {
      console.error('Error loading existing workers:', error);
      throw error;
    }
  }
}