import { AudioPlayerStatus, AudioResource, createAudioPlayer, createAudioResource, StreamType } from "@discordjs/voice";
import { getQueue } from "./queue.js";
import { spawn } from "child_process";

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

async function streamYouTubeAudio(
  url: string,
): Promise<AudioResource> {
  return new Promise((resolve, reject) => {
    // Configure yt-dlp to extract and process audio with FFmpeg
    const ytDlp = spawn("yt-dlp", [
      "-o",
      "-", // Output to stdout
      "-f",
      "bestaudio/best", // Select best audio format
      "--no-playlist", // Don't process playlists
      "--quiet", // Quiet mode
      "--extract-audio", // Extract audio
      "--audio-format", "opus", // Convert to opus format
      "--audio-quality", "0", // Best quality
      "--postprocessor-args", // FFmpeg args for the postprocessor
      "-ar 48000 -ac 2 -b:a 96k", // Sample rate, channels, bitrate
      url, // The URL to download from
    ]);

    // Handle process errors
    ytDlp.on("error", (error) => {
      reject(new Error(`yt-dlp process error: ${error.message}`));
    });

    // Handle process exit
    ytDlp.on("close", (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`yt-dlp exited with code ${code}`));
      }
    });

    // Log any stderr output for debugging
    ytDlp.stderr.on("data", (data) => {
      console.error(`yt-dlp error: ${data}`);
    });

    // Create an audio resource from the yt-dlp output
    const resource = createAudioResource(ytDlp.stdout, {
      inputType: StreamType.Opus,
    });

    player.play(resource);

    resolve(resource);
  });
}

export async function playNext() {
    const queue = getQueue();
    const song = queue.pop();
    if (!song) {
        queue.playing = false;
        console.log('No song to play');
        return;
    }
    console.log(`Now playing: ${song.url}`);

    getQueue().playing = true;
    await streamYouTubeAudio(song.url);
}

export function getPlayer() {
    return player;
}