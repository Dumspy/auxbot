import * as grpc from "@grpc/grpc-js";
import { env } from "../../env.js";

export function getWorkerServiceAddress(guildId: string): string {
  return `auxbot-worker-${guildId}.${env.K8S_NAMESPACE}.svc.cluster.local:50051`;
}

export function createGrpcClient<T extends grpc.Client>(
  ClientClass: new (address: string, credentials: grpc.ChannelCredentials) => T,
  guildId: string,
): T {
  const address = getWorkerServiceAddress(guildId);
  return new ClientClass(address, grpc.credentials.createInsecure());
}
