import * as grpc from "@grpc/grpc-js";
import {
  SearchClient,
  SearchYouTubeResponse,
} from "@auxbot/protos/search";
import { env } from "../../env.js";
import { captureException } from "@auxbot/sentry";

function getWorkerServiceAddress(guildId: string): string {
  return `auxbot-worker-${guildId}.${env.K8S_NAMESPACE}.svc.cluster.local:50051`;
}

function createSearchClient(guildId: string): SearchClient {
  const address = getWorkerServiceAddress(guildId);
  return new SearchClient(address, grpc.credentials.createInsecure());
}

export async function searchYouTube(
  guildId: string,
  query: string,
  page: number,
  limit: number,
): Promise<SearchYouTubeResponse> {
  return new Promise((resolve, reject) => {
    const client = createSearchClient(guildId);
    const request = { query, page, limit };

    client.searchYouTube(request, (error, response) => {
      if (error) {
        captureException(error, {
          tags: {
            guildId,
            query,
            page,
            limit,
          },
        });
        reject(error);
        return;
      }
      resolve(response);
    });
  });
}
