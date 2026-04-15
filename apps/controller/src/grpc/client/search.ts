import { Metadata } from "@grpc/grpc-js";
import {
  ResolveYouTubePlaylistResponse,
  SearchClient,
  SearchYouTubeResponse,
} from "@auxbot/protos/search";
import { captureException } from "@auxbot/sentry";
import { createGrpcClient } from "./common.js";

export async function searchYouTube(
  guildId: string,
  query: string,
  page: number,
  limit: number,
): Promise<SearchYouTubeResponse> {
  return new Promise((resolve, reject) => {
    const client = createGrpcClient(SearchClient, guildId);
    const request = { query, page, limit };

    client.searchYouTube(
      request,
      new Metadata(),
      { deadline: new Date(Date.now() + 10000) },
      (error, response) => {
        if (error) {
          captureException(error, {
            tags: {
              guildId,
              query,
              page,
              limit,
            },
          });
          client.close();
          reject(error);
          return;
        }
        client.close();
        resolve(response);
      },
    );
  });
}

export async function resolveYouTubePlaylist(
  guildId: string,
  url: string,
  offset: number,
  limit: number,
): Promise<ResolveYouTubePlaylistResponse> {
  return new Promise((resolve, reject) => {
    const client = createGrpcClient(SearchClient, guildId);
    const request = { url, offset, limit };

    client.resolveYouTubePlaylist(
      request,
      new Metadata(),
      { deadline: new Date(Date.now() + 10000) },
      (error, response) => {
        if (error) {
          captureException(error, {
            tags: {
              guildId,
              url,
              offset,
              limit,
            },
          });
          client.close();
          reject(error);
          return;
        }

        client.close();
        resolve(response);
      },
    );
  });
}
