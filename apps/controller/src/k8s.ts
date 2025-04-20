import * as k8s from '@kubernetes/client-node';
import { env } from './env.js';
import { createWorkerJob } from './jobs/worker.js';

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(k8s.BatchV1Api);

export function getK8sApi() {
    return k8sApi;
}

export async function spawnWorkerPod(guildId: string, channelId: string): Promise<string> {
    const workerJob = await k8sApi.createNamespacedJob({
        namespace: env.K8S_NAMESPACE,
        body: createWorkerJob(guildId, channelId)
    });

    const jobName = workerJob.metadata?.name || 'unknown';
    console.log(`Worker job created: ${jobName} for guild: ${guildId}, channel: ${channelId}`);

    return jobName;
}