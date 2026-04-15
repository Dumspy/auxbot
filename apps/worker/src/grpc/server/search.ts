import { spawn } from "node:child_process";
import type {
  ResolveYouTubePlaylistRequest,
  ResolveYouTubePlaylistResponse,
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
  url?: string;
  uploader: string;
  duration: number;
  thumbnail: string;
  thumbnails?: Array<{ url?: string }>;
  view_count: number;
}

interface YtDlpPlaylistResult {
  title?: string;
  entries?: YtDlpResult[];
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

    const actualLimit = Math.max(1, Math.min(limit || 5, 10));
    const offset = Math.max(0, page) * actualLimit;

    const searchQuery = `ytsearch${offset + actualLimit + 1}:${query}`;

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
  resolveYouTubePlaylist: async function (
    call: ServerUnaryCall<ResolveYouTubePlaylistRequest, ResolveYouTubePlaylistResponse>,
    callback: sendUnaryData<ResolveYouTubePlaylistResponse>,
  ): Promise<void> {
    const { url, offset, limit } = call.request;

    if (!url || url.trim() === "") {
      callback(new Error("Playlist URL cannot be empty"), null);
      return;
    }

    const actualLimit = Math.max(1, Math.min(limit || 10, 10));
    const actualOffset = Math.max(0, offset);

    try {
      const response = await resolvePlaylistWithYtDlp(url, actualOffset, actualLimit);
      callback(null, response);
    } catch (error) {
      console.error("Error resolving YouTube playlist:", error);
      callback(
        new Error(
          `Failed to resolve YouTube playlist: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
        null,
      );
    }
  },
});

function getResultUrl(result: YtDlpResult): string {
  if (result.webpage_url) {
    return result.webpage_url;
  }

  if (result.url?.startsWith("http")) {
    return result.url;
  }

  if (result.id) {
    return `https://www.youtube.com/watch?v=${result.id}`;
  }

  return "";
}

function getThumbnailUrl(result: YtDlpResult): string {
  if (result.thumbnail) {
    return result.thumbnail;
  }

  for (const thumbnail of result.thumbnails ?? []) {
    if (thumbnail.url) {
      return thumbnail.url;
    }
  }

  return "";
}

function mapResult(result: YtDlpResult): SearchYouTubeResponse["results"][number] {
  return {
    id: result.id ?? "",
    title: result.title ?? "",
    url: getResultUrl(result),
    uploader: result.uploader ?? "Unknown",
    duration: result.duration ?? 0,
    thumbnail: getThumbnailUrl(result),
    viewCount: result.view_count ?? 0,
  };
}

async function searchWithYtDlp(query: string): Promise<SearchYouTubeResponse["results"]> {
  return new Promise((resolve, reject) => {
    const results: SearchYouTubeResponse["results"] = [];

    const ytDlp = spawn("yt-dlp", [
      "--flat-playlist",
      "--dump-json",
      "--quiet",
      "--no-warnings",
      "--",
      query,
    ]);

    const timeout = setTimeout(() => {
      ytDlp.kill("SIGKILL");
      reject(new Error("yt-dlp timeout: 15s"));
    }, 15000);

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

          results.push(mapResult(data));
        } catch (parseError) {
          console.error("Failed to parse yt-dlp output:", parseError);
        }
      }

      buffer = lines[lines.length - 1] ?? "";
    });

    ytDlp.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`yt-dlp exited with code ${code}`));
        return;
      }
      resolve(results);
    });

    ytDlp.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn yt-dlp: ${error?.message ?? "Unknown error"}`));
    });
  });
}

async function resolvePlaylistWithYtDlp(
  url: string,
  offset: number,
  limit: number,
): Promise<ResolveYouTubePlaylistResponse> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const playlistStart = offset + 1;
    const playlistEnd = offset + limit + 1;

    const ytDlp = spawn("yt-dlp", [
      "--flat-playlist",
      "--dump-single-json",
      "--quiet",
      "--no-warnings",
      "--playlist-start",
      `${playlistStart}`,
      "--playlist-end",
      `${playlistEnd}`,
      "--",
      url,
    ]);

    const timeout = setTimeout(() => {
      ytDlp.kill("SIGKILL");
      reject(new Error("yt-dlp timeout: 15s"));
    }, 15000);

    ytDlp.stdout.setEncoding("utf-8");
    ytDlp.stdout.on("data", (data: string) => {
      stdout += data;
    });

    ytDlp.stderr.setEncoding("utf-8");
    ytDlp.stderr.on("data", (data: string) => {
      stderr += data;
    });

    ytDlp.on("close", (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as YtDlpPlaylistResult;
        const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
        const items = entries.map(mapResult).filter((item) => item.url.length > 0).slice(0, limit);

        resolve({
          title: parsed.title ?? "",
          items,
          hasMore: entries.length > limit,
        });
      } catch (error) {
        reject(new Error(`Failed to parse yt-dlp playlist output: ${error}`));
      }
    });

    ytDlp.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn yt-dlp: ${error?.message ?? "Unknown error"}`));
    });
  });
}
