export interface SpotifyTrackMetadata {
  trackId: string;
  sourceUrl: string;
  title: string;
  artists: string[];
  artistText: string;
  durationMs: number;
  thumbnailUrl: string;
}

type SpotifyResolveErrorCode =
  | "invalid_url"
  | "unsupported_type"
  | "fetch_failed"
  | "invalid_payload";

export class SpotifyResolveError extends Error {
  constructor(
    readonly code: SpotifyResolveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SpotifyResolveError";
  }
}

export function isSpotifyInput(input: string): boolean {
  if (input.indexOf("spotify:") === 0) {
    return true;
  }

  try {
    return new URL(input).hostname === "open.spotify.com";
  } catch {
    return false;
  }
}

export async function resolveSpotifyTrack(input: string): Promise<SpotifyTrackMetadata> {
  const trackId = parseSpotifyTrackId(input);

  if (!trackId) {
    throw new SpotifyResolveError("invalid_url", "Only Spotify track links are supported.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`https://open.spotify.com/embed/track/${trackId}`, {
      headers: {
        Accept: "text/html",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new SpotifyResolveError(
        "fetch_failed",
        `Spotify lookup failed with status ${response.status}.`,
      );
    }

    const html = await response.text();
    const payload = extractNextDataPayload(html);
    const metadata = parseSpotifyTrackMetadata(payload, trackId);

    if (!metadata) {
      throw new SpotifyResolveError(
        "invalid_payload",
        "Spotify returned a track page we could not understand.",
      );
    }

    return metadata;
  } catch (error) {
    if (error instanceof SpotifyResolveError) {
      throw error;
    }

    throw new SpotifyResolveError(
      "fetch_failed",
      error instanceof Error ? error.message : "Failed to fetch Spotify track metadata.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function parseSpotifyTrackId(input: string): string | null {
  if (input.indexOf("spotify:") === 0) {
    const parts = input.split(":");
    if (parts.length === 3 && parts[1] === "track" && parts[2]) {
      return parts[2];
    }

    if (parts.length >= 2) {
      throw new SpotifyResolveError("unsupported_type", "Only Spotify track links are supported.");
    }

    return null;
  }

  let url: URL;

  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (url.hostname !== "open.spotify.com") {
    return null;
  }

  const pathParts = url.pathname.split("/").filter(Boolean);

  if (pathParts.length < 2) {
    return null;
  }

  if (pathParts[0] !== "track") {
    throw new SpotifyResolveError("unsupported_type", "Only Spotify track links are supported.");
  }

  return pathParts[1] || null;
}

function extractNextDataPayload(html: string): unknown {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  const payload = match?.[1];

  if (!payload) {
    throw new SpotifyResolveError("invalid_payload", "Spotify track metadata payload was missing.");
  }

  return JSON.parse(payload) as unknown;
}

function parseSpotifyTrackMetadata(payload: unknown, trackId: string): SpotifyTrackMetadata | null {
  const entity = getNestedObject(payload, ["props", "pageProps", "state", "data", "entity"]);

  if (!entity) {
    return null;
  }

  const title = getString(entity.title) || getString(entity.name);
  const durationMs = getNumber(entity.duration) || 0;
  const artists = getArtists(entity);
  const thumbnailUrl = getThumbnailUrl(entity);

  if (!title || artists.length === 0) {
    return null;
  }

  return {
    trackId,
    sourceUrl: `https://open.spotify.com/track/${trackId}`,
    title,
    artists,
    artistText: artists.join(", "),
    durationMs,
    thumbnailUrl,
  };
}

function getArtists(entity: Record<string, unknown>): string[] {
  const artistsValue = entity.artists;

  if (!Array.isArray(artistsValue)) {
    return [];
  }

  return artistsValue
    .map((artist) => {
      if (typeof artist !== "object" || artist === null) {
        return "";
      }

      return getString((artist as Record<string, unknown>).name) || "";
    })
    .filter((artist): artist is string => artist.length > 0);
}

function getThumbnailUrl(entity: Record<string, unknown>): string {
  const visualIdentity = getObject(entity.visualIdentity);
  const image = visualIdentity ? visualIdentity.image : undefined;

  if (!Array.isArray(image)) {
    return "";
  }

  for (const entry of image) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const url = getString((entry as Record<string, unknown>).url);
    if (url) {
      return url;
    }
  }

  return "";
}

function getNestedObject(value: unknown, path: string[]): Record<string, unknown> | null {
  let current: unknown = value;

  for (const key of path) {
    if (typeof current !== "object" || current === null || !(key in current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return getObject(current);
}

function getObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && isFinite(value) ? value : null;
}
