import * as k8s from '@kubernetes/client-node';
import { env } from './env.js';
import { createWorkerJob } from './jobs/worker.js';
import { WorkerRegistry } from './registry/worker-registry.js';

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(k8s.BatchV1Api);

// Create a worker registry instance
export const workerRegistry = new WorkerRegistry();

export function getK8sApi() {
    return k8sApi;
}

export async function spawnWorkerPod(guildId: string, channelId: string): Promise<string> {
    // Check if a worker for this guild already exists
    const existingWorkers = workerRegistry.getWorkersByGuild(guildId);
    if (existingWorkers[0]) {
        // If there's an existing worker, return its job name
        const existingWorker = existingWorkers[0];
        console.log(`Using existing worker for guild ${guildId}: ${existingWorker.job.metadata?.name}`);
        return existingWorker.job.metadata?.name || 'unknown';
    }

    const workerJob = await k8sApi.createNamespacedJob({namespace: env.K8S_NAMESPACE, body: createWorkerJob(guildId, channelId)});
    const jobName = workerJob.metadata?.name || 'unknown';
    console.log(`Worker job created: ${jobName} for guild: ${guildId}, channel: ${channelId}`);

    // Register the newly spawned worker in our registry
    workerRegistry.registerWorker(workerJob, guildId, channelId);

    return jobName;
}