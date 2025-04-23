import { env } from '../env.js'
import * as k8s from '@kubernetes/client-node';

interface WorkerResources {
    service: k8s.V1Service;
    deployment: k8s.V1Deployment;
}

export function createWorkerResources(guildId: string, channelId: string): WorkerResources {
    const name = 'auxbot-worker';
    
    // Create the headless service
    const service: k8s.V1Service = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
            name: `${name}-${guildId}`,  // Service name needs to be unique per guild for DNS
            labels: {
                app: 'worker',
                'discord-guild-id': guildId
            }
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

    // Create the deployment with a generic name
    const deployment: k8s.V1Deployment = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
            name,  // Use generic name since labels identify the specific worker
            labels: {
                app: 'worker',
                'discord-guild-id': guildId,
                'discord-channel-id': channelId
            },
        },
        spec: {
            replicas: 1,
            selector: {
                matchLabels: {
                    app: 'worker',
                    'discord-guild-id': guildId,
                }
            },
            template: {
                metadata: {
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
                            }
                        ]
                    }]
                }
            }
        }
    };

    return { service, deployment };
}
