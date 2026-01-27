import { getCoreV1Api } from "./k8s.js";
import { env } from "./env.js";
import { createWorkerResources } from "./jobs/worker.js";
import { WorkerRegistry } from "./registry/worker-registry.js";

export async function spawnWorkerPod(guildId: string, channelId: string): Promise<string> {
  const workerRegistry = new WorkerRegistry({ k8sApi: getCoreV1Api() });

  const existingWorkers = workerRegistry.getWorkersByGuild(guildId);
  if (existingWorkers[0]) {
    const existingWorker = existingWorkers[0];
    console.log(`Using existing worker for guild ${guildId}: ${existingWorker.pod.metadata?.name}`);
    return existingWorker.pod.metadata?.name || "unknown";
  }

  const resources = createWorkerResources(guildId, channelId);
  const coreV1Api = getCoreV1Api();

  const workerPod = await coreV1Api.createNamespacedPod({
    namespace: env.K8S_NAMESPACE,
    body: resources.pod,
  });

  if (resources.service.metadata?.ownerReferences?.[0] && workerPod.metadata?.uid) {
    resources.service.metadata.ownerReferences[0].uid = workerPod.metadata.uid;
  } else {
    throw new Error("Failed to set owner reference: missing required metadata");
  }

  await coreV1Api.createNamespacedService({
    namespace: env.K8S_NAMESPACE,
    body: resources.service,
  });

  const podName = workerPod.metadata?.name || "unknown";
  console.log(`Worker pod created: ${podName} for guild: ${guildId}, channel: ${channelId}`);

  workerRegistry.registerWorker(workerPod, guildId, channelId);

  return podName;
}
