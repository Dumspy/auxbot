import * as grpc from '@grpc/grpc-js';
import { AddSongResponse, PlayerClient } from '@auxbot/protos/player';

function createPlayerClient(address: string): PlayerClient {
    return new PlayerClient(
        address,
        grpc.credentials.createInsecure()
    );
}

export async function addSong(address: string, url: string, requesterId: string): Promise<AddSongResponse>{
    return new Promise((resolve, reject) => {
        const client = createPlayerClient(address);
        const request = { url, requesterId };
        
        client.addSong(request, (error, response) => {
            if (error) {
                console.error('Error adding song:', error);
                reject(error);
                return;
            }
            resolve(response);
        });
    });
}