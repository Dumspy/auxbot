import { env } from '../env.js'
import * as k8s from '@kubernetes/client-node';

interface WorkerResources {
    service: k8s.V1Service;
    pod: k8s.V1Pod;  // Changed from deployment to pod
}

export function createWorkerResources(guildId: string, channelId: string): WorkerResources {
    const name = `auxbot-worker-${guildId}`;
    
    // Create the pod instead of deployment
    const pod: k8s.V1Pod = {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
            name,
            labels: {
                app: 'worker',
                'discord-guild-id': guildId,
                'discord-channel-id': channelId
            },
        },
        spec: {
            containers: [{
                name: 'worker',
                image: env.WORKER_IMAGE,
                imagePullPolicy: 'Always',
                ports: [
                    {
                        containerPort: 50051,
                        name: 'grpc'
                    }
                ],
                env: [
                    {
                        name: 'DISCORD_TOKEN',
                        value: env.DISCORD_TOKEN
                    },
                    {
                        name: 'DISCORD_CLIENT_ID',
                        value: env.DISCORD_CLIENT_ID
                    },
                    {
                        name: 'DISCORD_GUILD_ID',
                        value: guildId
                    },
                    {
                        name: 'DISCORD_CHANNEL_ID',
                        value: channelId
                    },
                    {
                        name: 'GRPC_PORT',
                        value: '50051'
                    },
                    {
                        name: 'INACTIVITY_TIMEOUT_MINUTES',
                        value: env.INACTIVITY_TIMEOUT_MINUTES
                    },
                    {
                        name: 'K8S_NAMESPACE',
                        value: env.K8S_NAMESPACE
                    },
                    {
                        name: 'SENTRY_DSN',
                        value: env.SENTRY_DSN
                    },
                    {
                        name: 'NODE_ENV',
                        value: env.NODE_ENV
                    }
                ]
            }]
        }
    };

    // Create the headless service with owner reference to the pod
    const service: k8s.V1Service = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
            name,
            labels: {
                app: 'worker',
                'discord-guild-id': guildId,
                'discord-channel-id': channelId
            },
            ownerReferences: [{
                apiVersion: 'v1',
                kind: 'Pod',  // Changed from apps/v1 Deployment
                name: pod.metadata!.name!,
                uid: '', // This will be filled in after pod creation
                controller: true,
                blockOwnerDeletion: true
            }]
        },
        spec: {
            clusterIP: 'None', // This makes it a headless service
            selector: {
                app: 'worker',
                'discord-guild-id': guildId
            },
            ports: [{
                port: 50051,
                targetPort: 50051,
                name: 'grpc'
            }]
        }
    };

    return { service, pod };
}
