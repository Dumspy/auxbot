import * as grpc from "@grpc/grpc-js";
import {
  AddSongRequest,
  AddSongResponse,
  ClearQueueRequest,
  ClearQueueResponse,
  PauseRequest,
  PauseResponse,
  PlayerServer,
  PlayerService,
  PlayerStatus,
  PlayerStatusRequest,
  PlayerStatusResponse,
  QueueStatusRequest,
  QueueStatusResponse,
  ResumeRequest,
  ResumeResponse,
  SkipRequest,
  SkipResponse,
} from "@auxbot/protos/player";
import { registerService } from "../index.js";
import { queue } from "../../queue.js";
import { player } from "../../player.js";

// Helper function to convert AudioPlayerStatus to PlayerStatus from proto
function convertPlayerStatus(status: string): PlayerStatus {
  switch (status) {
    case "idle":
      return PlayerStatus.IDLE;
    case "playing":
      return PlayerStatus.PLAYING;
    case "paused":
      return PlayerStatus.PAUSED;
    case "buffering":
      return PlayerStatus.BUFFERING;
    default:
      return PlayerStatus.ERROR;
  }
}

registerService<PlayerService, PlayerServer>(PlayerService, {
  addSong: function (
    call: grpc.ServerUnaryCall<AddSongRequest, AddSongResponse>,
    callback: grpc.sendUnaryData<AddSongResponse>,
  ): void {
    const { url, requesterId } = call.request;

    const queuePosition = queue.add(url, requesterId);

    const response = {
      success: true,
      message: "Song added to queue",
      isPlaying: false,
      position: queuePosition,
    };

    if (!queue.playing) {
      response.isPlaying = true;
      player.playNext();
    }

    callback(null, response);
  },
  skipSong: function (
    call: grpc.ServerUnaryCall<SkipRequest, SkipResponse>,
    callback: grpc.sendUnaryData<SkipResponse>,
  ): void {
    try {
      // Use the skipSong method from our player instance which now returns a more detailed response
      const result = player.skipSong();

      callback(null, {
        success: result.success,
        message: result.message,
      });
    } catch (error) {
      console.error("Error skipping song:", error);
      callback(null, {
        success: false,
        message: `Failed to skip song: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  },
  clearQueue: function (
    call: grpc.ServerUnaryCall<ClearQueueRequest, ClearQueueResponse>,
    callback: grpc.sendUnaryData<ClearQueueResponse>,
  ): void {
    try {
      queue.clear();
      callback(null, {
        success: true,
        message: "Queue cleared successfully",
      });
    } catch (error) {
      console.error("Error clearing queue:", error);
      callback(null, {
        success: false,
        message: `Failed to clear queue: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  },
  getQueueStatus: function (
    call: grpc.ServerUnaryCall<QueueStatusRequest, QueueStatusResponse>,
    callback: grpc.sendUnaryData<QueueStatusResponse>,
  ): void {
    try {
      const status = player.getPlayerStatus();

      const response: QueueStatusResponse = {
        items: queue.queue.map((item) => ({
          url: item.url,
          requesterId: item.requesterId,
        })),
        isPlaying: queue.playing,
        nowPlayingUrl: status.currentSong?.url || "",
        nowPlayingRequester: status.currentSong?.requesterId || "",
      };

      callback(null, response);
    } catch (error) {
      console.error("Error getting queue status:", error);
      callback(
        new Error(
          `Failed to get queue status: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
        null,
      );
    }
  },
  pausePlayback: function (
    call: grpc.ServerUnaryCall<PauseRequest, PauseResponse>,
    callback: grpc.sendUnaryData<PauseResponse>,
  ): void {
    try {
      const success = player.pausePlayback();

      callback(null, {
        success,
        message: success ? "Playback paused" : "Cannot pause: No active playback",
      });
    } catch (error) {
      console.error("Error pausing playback:", error);
      callback(null, {
        success: false,
        message: `Failed to pause playback: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  },
  resumePlayback: function (
    call: grpc.ServerUnaryCall<ResumeRequest, ResumeResponse>,
    callback: grpc.sendUnaryData<ResumeResponse>,
  ): void {
    try {
      const success = player.resumePlayback();

      callback(null, {
        success,
        message: success ? "Playback resumed" : "Cannot resume: Player is not paused",
      });
    } catch (error) {
      console.error("Error resuming playback:", error);
      callback(null, {
        success: false,
        message: `Failed to resume playback: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  },
  getPlayerStatus: function (
    call: grpc.ServerUnaryCall<PlayerStatusRequest, PlayerStatusResponse>,
    callback: grpc.sendUnaryData<PlayerStatusResponse>,
  ): void {
    try {
      const status = player.getPlayerStatus();

      const response: PlayerStatusResponse = {
        status: convertPlayerStatus(status.status),
        currentUrl: status.currentSong?.url || "",
        requesterId: status.currentSong?.requesterId || "",
        hasQueue: status.hasQueue,
        queueLength: status.queueLength,
      };

      callback(null, response);
    } catch (error) {
      console.error("Error getting player status:", error);
      callback(
        new Error(
          `Failed to get player status: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
        null,
      );
    }
  },
});
