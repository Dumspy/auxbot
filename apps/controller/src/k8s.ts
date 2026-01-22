import * as k8s from "@kubernetes/client-node";
import { env } from "./env.js";
import { createWorkerResources } from "./jobs/worker.js";
import { WorkerRegistry } from "./registry/worker-registry.js";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(k8s.AppsV1Api);
const coreV1Api = kc.makeApiClient(k8s.CoreV1Api);

// Create a worker registry instance
export const workerRegistry = new WorkerRegistry();

export function getK8sApi() {
  return k8sApi;
}

export async function spawnWorkerPod(
  guildId: string,
  channelId: string,
): Promise<string> {
  // Check if a worker for this guild already exists
  const existingWorkers = workerRegistry.getWorkersByGuild(guildId);
  if (existingWorkers[0]) {
    // If there's an existing worker, return its pod name
    const existingWorker = existingWorkers[0];
    console.log(
      `Using existing worker for guild ${guildId}: ${existingWorker.pod.metadata?.name}`,
    );
    return existingWorker.pod.metadata?.name || "unknown";
  }

  // Create both service and pod resources
  const resources = createWorkerResources(guildId, channelId);

  // Create the pod first
  const workerPod = await coreV1Api.createNamespacedPod({
    namespace: env.K8S_NAMESPACE,
    body: resources.pod,
  });

  // Set the owner reference UID from the created pod
  if (
    resources.service.metadata?.ownerReferences?.[0] &&
    workerPod.metadata?.uid
  ) {
    resources.service.metadata.ownerReferences[0].uid = workerPod.metadata.uid;
  } else {
    throw new Error("Failed to set owner reference: missing required metadata");
  }

  // Then create the service with the updated owner reference
  await coreV1Api.createNamespacedService({
    namespace: env.K8S_NAMESPACE,
    body: resources.service,
  });

  const podName = workerPod.metadata?.name || "unknown";
  console.log(
    `Worker pod created: ${podName} for guild: ${guildId}, channel: ${channelId}`,
  );

  // Register the newly spawned worker in our registry
  workerRegistry.registerWorker(workerPod, guildId, channelId);

  return podName;
}
