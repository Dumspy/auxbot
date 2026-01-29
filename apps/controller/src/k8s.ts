import * as k8s from "@kubernetes/client-node";

let appsV1Api: k8s.AppsV1Api | null = null;
let coreV1Api: k8s.CoreV1Api | null = null;

export function getAppsV1Api(): k8s.AppsV1Api {
  if (!appsV1Api) {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    appsV1Api = kc.makeApiClient(k8s.AppsV1Api);
  }
  return appsV1Api;
}

export function setAppsV1Api(api: k8s.AppsV1Api): void {
  appsV1Api = api;
}

export function resetAppsV1Api(): void {
  appsV1Api = null;
}

export function getCoreV1Api(): k8s.CoreV1Api {
  if (!coreV1Api) {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    coreV1Api = kc.makeApiClient(k8s.CoreV1Api);
  }
  return coreV1Api;
}

export function setCoreV1Api(api: k8s.CoreV1Api): void {
  coreV1Api = api;
}

export function resetCoreV1Api(): void {
  coreV1Api = null;
}

export function getK8sApi() {
  return getAppsV1Api();
}

export { workerRegistry } from "./registry/worker-registry.js";
