import { AudioPlayerStatus, AudioResource, createAudioPlayer, createAudioResource, StreamType } from "@discordjs/voice";
import { spawn } from "child_process";
import path from "path";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { unlink } from "fs/promises";
import { queue } from "./queue.js";

class Player {
  private player = createAudioPlayer();
  private currentSong: { url: string, requesterId: string } | null = null;

  constructor() {
    this.player.on(AudioPlayerStatus.Idle, () => {
      console.log('Player is idle');
      this.playNext();
    });

    this.player.on('error', error => {
      console.error('Error in audio player:', error);
      this.playNext();
    });
          
    this.player.on('stateChange', (oldState, newState) => {
      console.log(`Player state changed from ${oldState.status} to ${newState.status}`);
    });
  }

  private async downloadAndPlayYouTubeAudio(url: string): Promise<AudioResource> {
    // Generate a unique filename in the auxbot temp directory
    const filename = path.join(
      "/tmp/auxbot",
      `audio-${randomUUID()}.opus`
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
        this.player.play(resource);

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

  /**
   * Play the next song in the queue
   */
  async playNext() {
    const song = queue.pop();
    if (!song) {
      queue.playing = false;
      this.currentSong = null;
      console.log('No song to play');
      return;
    }
    console.log(`Now playing: ${song.url}`);

    this.currentSong = song;
    queue.playing = true;
    await this.downloadAndPlayYouTubeAudio(song.url);
  }

  /**
   * Skip the current song and play the next one in the queue
   * @returns {boolean} Whether the skip was successful
   */
  skipSong(): boolean {
    if (!queue.playing) {
      console.log('Nothing is playing, cannot skip');
      return false;
    }
    
    // Stop the current playback
    this.player.stop();
    
    // playNext will be called by the Idle event handler
    return true;
  }

  /**
   * Pause the current playback
   * @returns {boolean} Whether the pause was successful
   */
  pausePlayback(): boolean {
    if (this.player.state.status === AudioPlayerStatus.Playing) {
      this.player.pause();
      console.log('Playback paused');
      return true;
    } else {
      console.log('Cannot pause: Player is not playing');
      return false;
    }
  }

  /**
   * Resume the current playback
   * @returns {boolean} Whether the resume was successful
   */
  resumePlayback(): boolean {
    if (this.player.state.status === AudioPlayerStatus.Paused) {
      this.player.unpause();
      console.log('Playback resumed');
      return true;
    } else {
      console.log('Cannot resume: Player is not paused');
      return false;
    }
  }

  /**
   * Get the current player status
   * @returns The current player status and information
   */
  getPlayerStatus() {
    return {
      status: this.player.state.status,
      currentSong: this.currentSong,
      hasQueue: queue.queue.length > 0,
      queueLength: queue.queue.length
    };
  }

  /**
   * Get the raw player instance
   * @returns The Discord.js audio player instance
   */
  getRawPlayer() {
    return this.player;
  }
}

// Export a singleton instance of the Player
export const player = new Player();
