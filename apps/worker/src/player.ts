import {
  AudioPlayerStatus,
  AudioResource,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  type VoiceConnection,
  type AudioPlayer,
} from "@discordjs/voice";
import { spawn } from "node:child_process";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { queue } from "./queue.js";
import { env } from "./env.js";
import { notifyShutdown } from "./grpc/client/worker_lifecycle.js";
import { getVoiceConnection } from "./index.js";
import { captureException } from "@auxbot/sentry";

interface PlayerDeps {
  createAudioPlayer: () => AudioPlayer;
  getVoiceConnection: () => VoiceConnection | undefined;
  spawn: (command: string, args: readonly string[]) => any;
  processExit: (code: number) => never;
}

function createProductionDeps(): PlayerDeps {
  return {
    createAudioPlayer,
    getVoiceConnection,
    spawn,
    processExit: (code: number) => process.exit(code),
  };
}

let defaultDeps: PlayerDeps = createProductionDeps();

export function setDefaultDeps(deps: PlayerDeps): void {
  defaultDeps = deps;
}

export function resetDefaultDeps(): void {
  defaultDeps = createProductionDeps();
}

class Player {
  private player: AudioPlayer;
  private currentSong: { url: string; requesterId: string } | null = null;
  private volume = 0.5;
  private lastActivityTime: number = Date.now();
  private inactivityCheckInterval: ReturnType<typeof setInterval>;
  private readonly INACTIVITY_TIMEOUT = parseInt(env.INACTIVITY_TIMEOUT_MINUTES) * 60 * 1000;

  constructor(deps: PlayerDeps = defaultDeps) {
    this.player = deps.createAudioPlayer();

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
      console.log(`Player state changed from ${oldState.status} to ${newState.status}`);
      this.updateLastActivity();
    });

    this.inactivityCheckInterval = setInterval(() => this.checkInactivity(deps), 60000);
  }

  private async gracefulShutdown(deps: PlayerDeps) {
    console.log("Performing graceful shutdown...");
    try {
      clearInterval(this.inactivityCheckInterval);
      this.player.stop();

      const connection = deps.getVoiceConnection();
      if (connection) {
        console.log("Disconnecting from voice channel...");
        connection.destroy();
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      await notifyShutdown("inactivity_timeout");
    } catch (error) {
      captureException(error, {
        tags: {
          function: "gracefulShutdown",
        },
      });
    } finally {
      deps.processExit(0);
    }
  }

  private updateLastActivity() {
    this.lastActivityTime = Date.now();
  }

  private async checkInactivity(deps: PlayerDeps) {
    const timeSinceLastActivity = Date.now() - this.lastActivityTime;
    if (
      timeSinceLastActivity >= this.INACTIVITY_TIMEOUT &&
      this.player.state.status !== AudioPlayerStatus.Playing
    ) {
      console.log("Shutting down due to inactivity");
      await this.gracefulShutdown(deps);
    }
  }

  private async downloadAndPlayYouTubeAudio(deps: PlayerDeps, url: string): Promise<AudioResource> {
    const filename = path.join("/tmp/auxbot", `audio-${randomUUID()}.opus`);

    return new Promise((resolve, reject) => {
      const ytDlp = deps.spawn("yt-dlp", [
        "-o",
        filename,
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

        const resource = createAudioResource(filename, {
          inputType: StreamType.Opus,
          inlineVolume: true,
        });

        resource.volume?.setVolume(this.volume);

        this.player.play(resource);

        resource.playStream.on("close", async () => {
          try {
            await unlink(filename);
          } catch {
            console.warn(`Failed to delete temp file: ${filename}`);
          }
        });

        resolve(resource);
      });
    });
  }

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
    await this.downloadAndPlayYouTubeAudio(defaultDeps, song.url);
  }

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
      message: hasNextSong ? "Skipped to next song" : "Skipped current song, queue is now empty",
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

export function createPlayer(deps: Partial<PlayerDeps> = {}) {
  return new Player({ ...defaultDeps, ...deps });
}

export const player = new Player();
