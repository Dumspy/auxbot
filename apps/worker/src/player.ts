import { AudioPlayerStatus, createAudioPlayer, createAudioResource } from "@discordjs/voice";
import { getQueue } from "./queue.js";
import ytdl from "ytdl-core";

const player = createAudioPlayer()

player.on(AudioPlayerStatus.Idle, () => {
    console.log('Player is idle');
    playNext()
});

player.on('error', error => {
    console.error('Error in audio player:', error);
    playNext()
});
        
player.on('stateChange', (oldState, newState) => {
    console.log(`Player state changed from ${oldState.status} to ${newState.status}`);
});

export function playNext() {
    const queue = getQueue();
    const song = queue.pop();
    if (!song) {
        queue.playing = false;
        console.log('No song to play');
        return;
    }
    console.log(`Now playing: ${song.url}`);

    const stream = ytdl(song.url, { filter: 'audioonly' });
    player.play(createAudioResource(stream));
    getQueue().playing = true;
}

export function getPlayer() {
    return player;
}