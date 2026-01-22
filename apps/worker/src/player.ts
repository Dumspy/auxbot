import {
  AudioPlayerStatus,
  AudioResource,
  createAudioPlayer,
  createAudioResource,
  StreamType,
} from "@discordjs/voice";
import { spawn } from "child_process";
import path from "path";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { unlink } from "fs/promises";
import { queue } from "./queue.js";
import { env } from "./env.js";
import { notifyShutdown } from "./grpc/client/worker_lifecycle.js";
import { getVoiceConnection } from "./index.js";
import { captureException } from "@auxbot/sentry";

class Player {
  private player = createAudioPlayer();
  private currentSong: { url: string; requesterId: string } | null = null;
  private volume = 0.5; // 50% volume
  private lastActivityTime: number = Date.now();
  private inactivityCheckInterval: ReturnType<typeof setInterval>;
  private readonly INACTIVITY_TIMEOUT =
    parseInt(env.INACTIVITY_TIMEOUT_MINUTES) * 60 * 1000; // Convert minutes to milliseconds

  constructor() {
    this.player.on(AudioPlayerStatus.Idle, () => {
      console.log("Player is idle");
      this.playNext();
    });

    this.player.on("error", (error) => {
      captureException(error, {
        tags: {
          function: "player.on error",
        },
      });
      this.playNext();
    });

    this.player.on("stateChange", (oldState, newState) => {
      console.log(
        `Player state changed from ${oldState.status} to ${newState.status}`,
      );
      this.updateLastActivity();
    });

    this.inactivityCheckInterval = setInterval(
      () => this.checkInactivity(),
      60000,
    );
  }

  private async gracefulShutdown() {
    console.log("Performing graceful shutdown...");
    try {
      // Stop any current playback and clear interval
      clearInterval(this.inactivityCheckInterval);
      this.player.stop();

      // Disconnect from voice channel first
      const connection = getVoiceConnection();
      if (connection) {
        console.log("Disconnecting from voice channel...");
        connection.destroy();
      }

      // Wait a moment for the voice connection to fully close
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Now notify controller about shutdown
      await notifyShutdown("inactivity_timeout");
    } catch (error) {
      captureException(error, {
        tags: {
          function: "gracefulShutdown",
        },
      });
    } finally {
      process.exit(0);
    }
  }

  private updateLastActivity() {
    this.lastActivityTime = Date.now();
  }

  private async checkInactivity() {
    const timeSinceLastActivity = Date.now() - this.lastActivityTime;
    if (
      timeSinceLastActivity >= this.INACTIVITY_TIMEOUT &&
      this.player.state.status !== AudioPlayerStatus.Playing
    ) {
      console.log("Shutting down due to inactivity");
      await this.gracefulShutdown();
    }
  }

  private async downloadAndPlayYouTubeAudio(
    url: string,
  ): Promise<AudioResource> {
    // Generate a unique filename in the auxbot temp directory
    const filename = path.join("/tmp/auxbot", `audio-${randomUUID()}.opus`);

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
        captureException(error, {
          tags: {
            function: "downloadAndPlayYouTubeAudio",
            url,
          },
        });
        reject(new Error(`yt-dlp process error: ${error.message}`));
      });

      ytDlp.stderr.on("data", (data) => {
        console.error(`yt-dlp error: ${data}`);
      });

      ytDlp.on("close", async (code) => {
        if (code !== 0 && code !== null) {
          captureException(new Error(`yt-dlp exited with code ${code}`), {
            tags: {
              function: "downloadAndPlayYouTubeAudio",
              url,
              code,
            },
          });
          reject(new Error(`yt-dlp exited with code ${code}`));
          return;
        }

        // Check if file exists
        if (!existsSync(filename)) {
          captureException(new Error("Audio file was not created."), {
            tags: {
              function: "downloadAndPlayYouTubeAudio",
              url,
            },
          });
          reject(new Error("Audio file was not created."));
          return;
        }

        // Create an audio resource from the file
        const resource = createAudioResource(filename, {
          inputType: StreamType.Opus,
          inlineVolume: true,
        });

        // Set the volume
        resource.volume?.setVolume(this.volume);

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
    this.updateLastActivity();
    const song = queue.pop();
    if (!song) {
      queue.playing = false;
      this.currentSong = null;
      console.log("No song to play");
      return;
    }
    console.log(`Now playing: ${song.url}`);

    this.currentSong = song;
    queue.playing = true;
    await this.downloadAndPlayYouTubeAudio(song.url);
  }

  /**
   * Skip the current song and play the next one in the queue
   * @returns Object with success status and information about the next song
   */
  skipSong(): { success: boolean; hasNext: boolean; message: string } {
    if (!queue.playing) {
      return {
        success: false,
        hasNext: false,
        message: "Nothing is currently playing",
      };
    }

    const hasNextSong = queue.queue.length > 0;

    this.player.stop();

    if (hasNextSong) {
      setTimeout(() => this.playNext(), 0);
    } else {
      queue.playing = false;
      this.currentSong = null;
    }

    return {
      success: true,
      hasNext: hasNextSong,
      message: hasNextSong
        ? "Skipped to next song"
        : "Skipped current song, queue is now empty",
    };
  }

  pausePlayback(): boolean {
    if (this.player.state.status === AudioPlayerStatus.Playing) {
      this.player.pause();
      console.log("Playback paused");
      return true;
    } else {
      console.log("Cannot pause: Player is not playing");
      return false;
    }
  }

  resumePlayback(): boolean {
    if (this.player.state.status === AudioPlayerStatus.Paused) {
      this.player.unpause();
      console.log("Playback resumed");
      return true;
    } else {
      console.log("Cannot resume: Player is not paused");
      return false;
    }
  }

  getPlayerStatus() {
    return {
      status: this.player.state.status,
      currentSong: this.currentSong,
      hasQueue: queue.queue.length > 0,
      queueLength: queue.queue.length,
    };
  }

  getRawPlayer() {
    return this.player;
  }
}

// Export a singleton instance of the Player
export const player = new Player();
