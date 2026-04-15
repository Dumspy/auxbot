import {
  AddSongResponse,
  ClearQueueResponse,
  PauseResponse,
  PlayerClient,
  PlayerStatusResponse,
  QueueStatusResponse,
  ResumeResponse,
  SongSource,
  SkipResponse,
} from "@auxbot/protos/player";
import { captureException } from "@auxbot/sentry";
import { createGrpcClient } from "./common.js";

interface AddSongInput {
  playbackUrl: string;
  requesterId: string;
  sourceUrl?: string;
  title?: string;
  artistText?: string;
  source?: SongSource;
}

function createPlayerClient(guildId: string): PlayerClient {
  return createGrpcClient(PlayerClient, guildId);
}

export async function addSong(
  guildId: string,
  song: AddSongInput,
): Promise<AddSongResponse> {
  return new Promise((resolve, reject) => {
    const client = createPlayerClient(guildId);
    const request = {
      playbackUrl: song.playbackUrl,
      requesterId: song.requesterId,
      sourceUrl: song.sourceUrl || song.playbackUrl,
      title: song.title || "",
      artistText: song.artistText || "",
      source: song.source ?? SongSource.SONG_SOURCE_UNSPECIFIED,
    };

    client.addSong(request, (error, response) => {
      if (error) {
        captureException(error, {
          tags: {
            guildId,
            playbackUrl: request.playbackUrl,
            sourceUrl: request.sourceUrl,
            requesterId: request.requesterId,
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
