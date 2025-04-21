import { AudioPlayerStatus, AudioResource, createAudioPlayer, createAudioResource, StreamType } from "@discordjs/voice";
import { getQueue } from "./queue.js";
import { spawn } from "child_process";
import path from "path";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { unlink } from "fs/promises";

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

async function downloadAndPlayYouTubeAudio(
  url: string,
): Promise<AudioResource> {
  // Generate a unique filename for the download
  const filename = path.join(
    process.cwd(),
    `yt-dlp-audio-${randomUUID()}.opus`
  );

  return new Promise((resolve, reject) => {
    // yt-dlp command to download and convert audio
    const ytDlp = spawn("yt-dlp", [
      "-o",
      filename, // Output file
      "-f",
      "bestaudio/best",
      "--no-playlist",
      "--quiet",
      "--extract-audio",
      "--audio-format",
      "opus",
      "--audio-quality",
      "0",
      "--postprocessor-args",
      "-ar 48000 -ac 2 -b:a 96k",
      url,
    ]);

    ytDlp.on("error", (error) => {
      reject(new Error(`yt-dlp process error: ${error.message}`));
    });

    ytDlp.stderr.on("data", (data) => {
      console.error(`yt-dlp error: ${data}`);
    });

    ytDlp.on("close", async (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`yt-dlp exited with code ${code}`));
        return;
      }

      // Check if file exists
      if (!existsSync(filename)) {
        reject(new Error("Audio file was not created."));
        return;
      }

      // Create an audio resource from the file
      const resource = createAudioResource(filename, {
        inputType: StreamType.Opus,
        inlineVolume: true,
      });

      // Play the audio
      player.play(resource);

      // Clean up the file after playback ends
      resource.playStream.on("close", async () => {
        try {
          await unlink(filename);
        } catch (e) {
          console.warn(`Failed to delete temp file: ${filename}`);
        }
      });

      resolve(resource);
    });
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
    await downloadAndPlayYouTubeAudio(song.url);
}

export function getPlayer() {
    return player;
}
