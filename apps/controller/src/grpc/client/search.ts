import { Metadata } from "@grpc/grpc-js";
import { SearchClient, SearchYouTubeResponse } from "@auxbot/protos/search";
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
