import { env } from '../env.js'
import * as k8s from '@kubernetes/client-node';

export function createWorkerJob(guildId: string, channelId: string): k8s.V1Job {
    const jobName = `auxbot-worker-${Date.now()}`;

    return {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
            name: jobName,
            labels: {
                app: 'worker', // Changed to match what loadExistingWorkers looks for
                'discord-guild-id': guildId, // Changed to match what loadExistingWorkers looks for
                'discord-channel-id': channelId // Changed to match what loadExistingWorkers looks for
            },
        },
        spec: {
            template: {
                metadata: {
                    labels: {
                        app: 'worker', // Changed to match metadata labels
                        'discord-guild-id': guildId, // Changed to match metadata labels
                        'discord-channel-id': channelId // Changed to match metadata labels
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
                    }],
                    restartPolicy: 'Never'
                }
            },
            ttlSecondsAfterFinished: 100
        }
    };
}
