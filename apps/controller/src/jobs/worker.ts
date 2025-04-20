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
                app: 'auxbot-worker',
            },
        },
        spec: {
            template: {
                metadata: {
                    labels: {
                        app: 'auxbot-worker',
                    },
                },
                spec: {
                    containers: [{
                        name: 'worker',
                        image: env.WORKER_IMAGE, 
                        imagePullPolicy: 'Always',
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
