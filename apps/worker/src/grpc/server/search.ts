import { spawn } from "node:child_process";
import type {
  SearchServer,
  SearchYouTubeRequest,
  SearchYouTubeResponse,
} from "@auxbot/protos/search";
import { SearchService } from "@auxbot/protos/search";
import { registerService } from "../index.js";
import type { ServerUnaryCall, sendUnaryData } from "@grpc/grpc-js";

interface YtDlpResult {
  id: string;
  title: string;
  webpage_url: string;
  uploader: string;
  duration: number;
  thumbnail: string;
  view_count: number;
}

registerService<SearchService, SearchServer>(SearchService, {
  searchYouTube: async function (
    call: ServerUnaryCall<SearchYouTubeRequest, SearchYouTubeResponse>,
    callback: sendUnaryData<SearchYouTubeResponse>,
  ): Promise<void> {
    const { query, page, limit } = call.request;

    if (!query || query.trim() === "") {
      callback(new Error("Query cannot be empty"), null);
      return;
    }

    const actualLimit = limit || 5;
    const offset = page * actualLimit;

    const searchQuery = `ytsearch${offset + actualLimit}:${query}`;

    try {
      const results = await searchWithYtDlp(searchQuery);
      const paginatedResults = results.slice(offset, offset + actualLimit);

      const response: SearchYouTubeResponse = {
        results: paginatedResults,
        hasMore: results.length > offset + actualLimit,
      };

      callback(null, response);
    } catch (error) {
      console.error("Error searching YouTube:", error);
      callback(
        new Error(
          `Failed to search YouTube: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
        null,
      );
    }
  },
});

async function searchWithYtDlp(query: string): Promise<SearchYouTubeResponse["results"]> {
  return new Promise((resolve, reject) => {
    const results: SearchYouTubeResponse["results"] = [];

    const ytDlp = spawn("yt-dlp", [
      "--flat-playlist",
      "--dump-json",
      "--quiet",
      "--no-warnings",
      query,
    ]);

    ytDlp.stdout.setEncoding("utf-8");

    let buffer = "";

    ytDlp.stdout.on("data", (data: string) => {
      buffer += data;
      const lines = buffer.split("\n");

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        if (!line || line.trim() === "") continue;

        try {
          const data = JSON.parse(line) as YtDlpResult;

          results.push({
            id: data.id,
            title: data.title,
            url: data.webpage_url,
            uploader: data.uploader,
            duration: data.duration,
            thumbnail: data.thumbnail,
            viewCount: data.view_count,
          });
        } catch (parseError) {
          console.error("Failed to parse yt-dlp output:", parseError);
        }
      }

      buffer = lines[lines.length - 1] ?? "";
    });

    ytDlp.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp exited with code ${code}`));
        return;
      }
      resolve(results);
    });

    ytDlp.on("error", (error) => {
      reject(new Error(`Failed to spawn yt-dlp: ${error?.message ?? "Unknown error"}`));
    });
  });
}
