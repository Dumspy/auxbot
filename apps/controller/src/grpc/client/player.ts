import * as grpc from '@grpc/grpc-js';
import { 
    AddSongResponse, 
    ClearQueueResponse, 
    PauseResponse, 
    PlayerClient, 
    PlayerStatusResponse, 
    QueueStatusResponse, 
    ResumeResponse, 
    SkipResponse 
} from '@auxbot/protos/player';
import { env } from '../../env.js';
import { captureException } from '@auxbot/sentry';

function getWorkerServiceAddress(guildId: string): string {
    return `auxbot-worker-${guildId}.${env.K8S_NAMESPACE}.svc.cluster.local:50051`;
}

function createPlayerClient(guildId: string): PlayerClient {
    const address = getWorkerServiceAddress(guildId);
    return new PlayerClient(
        address,
        grpc.credentials.createInsecure()
    );
}

export async function addSong(guildId: string, url: string, requesterId: string): Promise<AddSongResponse> {
    return new Promise((resolve, reject) => {
        const client = createPlayerClient(guildId);
        const request = { url, requesterId };
        
        client.addSong(request, (error, response) => {
            if (error) {
                captureException(error, {
                    tags: {
                        guildId,
                        url,
                        requesterId,
                    },
                });
                reject(error);
                return;
            }
            resolve(response);
        });
    });
}

export async function skipSong(guildId: string): Promise<SkipResponse> {
    return new Promise((resolve, reject) => {
        const client = createPlayerClient(guildId);
        const request = {};
        
        client.skipSong(request, (error, response) => {
            if (error) {
                captureException(error, {
                    tags: {
                        guildId,
                    },
                });
                reject(error);
                return;
            }
            resolve(response);
        });
    });
}

export async function clearQueue(guildId: string): Promise<ClearQueueResponse> {
    return new Promise((resolve, reject) => {
        const client = createPlayerClient(guildId);
        const request = {};
        
        client.clearQueue(request, (error, response) => {
            if (error) {
                captureException(error, {
                    tags: {
                        guildId,
                    },
                });
                reject(error);
                return;
            }
            resolve(response);
        });
    });
}

export async function getQueueStatus(guildId: string): Promise<QueueStatusResponse> {
    return new Promise((resolve, reject) => {
        const client = createPlayerClient(guildId);
        const request = {};
        
        client.getQueueStatus(request, (error, response) => {
            if (error) {
                captureException(error, {
                    tags: {
                        guildId,
                    },
                });
                reject(error);
                return;
            }
            resolve(response);
        });
    });
}

export async function pausePlayback(guildId: string): Promise<PauseResponse> {
    return new Promise((resolve, reject) => {
        const client = createPlayerClient(guildId);
        const request = {};
        
        client.pausePlayback(request, (error, response) => {
            if (error) {
                captureException(error, {
                    tags: {
                        guildId,
                    },
                });
                reject(error);
                return;
            }
            resolve(response);
        });
    });
}

export async function resumePlayback(guildId: string): Promise<ResumeResponse> {
    return new Promise((resolve, reject) => {
        const client = createPlayerClient(guildId);
        const request = {};
        
        client.resumePlayback(request, (error, response) => {
            if (error) {
                captureException(error, {
                    tags: {
                        guildId,
                    },
                });
                reject(error);
                return;
            }
            resolve(response);
        });
    });
}

export async function getPlayerStatus(guildId: string): Promise<PlayerStatusResponse> {
    return new Promise((resolve, reject) => {
        const client = createPlayerClient(guildId);
        const request = {};
        
        client.getPlayerStatus(request, (error, response) => {
            if (error) {
                captureException(error, {
                    tags: {
                        guildId,
                    },
                });
                reject(error);
                return;
            }
            resolve(response);
        });
    });
}
