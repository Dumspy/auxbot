export interface SpotifyBaseTrackMetadata {
  sourceUrl: string;
  title: string;
  artistText: string;
  durationMs: number;
}

export interface SpotifyTrackMetadata extends SpotifyBaseTrackMetadata {
  trackId: string;
  artists: string[];
  thumbnailUrl: string;
}

export interface SpotifyPlaylistTrackMetadata extends SpotifyBaseTrackMetadata {
  trackId: string;
}

export interface SpotifyPlaylistMetadata {
  playlistId: string;
  sourceUrl: string;
  title: string;
  tracks: SpotifyPlaylistTrackMetadata[];
}

export type SpotifyInputKind = "track" | "playlist";

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
  return getSpotifyInputKind(input) !== null;
}

export function getSpotifyInputKind(input: string): SpotifyInputKind | null {
  return parseSpotifyInput(input)?.kind ?? null;
}

export async function resolveSpotifyTrack(input: string): Promise<SpotifyTrackMetadata> {
  const parsedInput = parseSpotifyInput(input);

  if (!parsedInput) {
    throw new SpotifyResolveError("invalid_url", "Only Spotify track and playlist links are supported.");
  }

  if (parsedInput.kind !== "track") {
    throw new SpotifyResolveError("unsupported_type", "Only Spotify track links are supported here.");
  }

  const payload = await fetchSpotifyEmbedEntity(parsedInput.kind, parsedInput.id);
  const metadata = parseSpotifyTrackMetadata(payload, parsedInput.id);

  if (!metadata) {
    throw new SpotifyResolveError(
      "invalid_payload",
      "Spotify returned a track page we could not understand.",
    );
  }

  return metadata;
}

export async function resolveSpotifyPlaylist(input: string): Promise<SpotifyPlaylistMetadata> {
  const parsedInput = parseSpotifyInput(input);

  if (!parsedInput) {
    throw new SpotifyResolveError("invalid_url", "Only Spotify track and playlist links are supported.");
  }

  if (parsedInput.kind !== "playlist") {
    throw new SpotifyResolveError("unsupported_type", "Only Spotify playlist links are supported here.");
  }

  const payload = await fetchSpotifyEmbedEntity(parsedInput.kind, parsedInput.id);
  const metadata = parseSpotifyPlaylistMetadata(payload, parsedInput.id);

  if (!metadata) {
    throw new SpotifyResolveError(
      "invalid_payload",
      "Spotify returned a playlist page we could not understand.",
    );
  }

  return metadata;
}

function parseSpotifyInput(input: string): { kind: SpotifyInputKind; id: string } | null {
  if (input.indexOf("spotify:") === 0) {
    const parts = input.split(":");

    if (parts.length === 3 && (parts[1] === "track" || parts[1] === "playlist") && parts[2]) {
      return { kind: parts[1], id: parts[2] };
    }

    if (parts.length >= 2) {
      throw new SpotifyResolveError(
        "unsupported_type",
        "Only Spotify track and playlist links are supported.",
      );
    }

    return null;
  }

  try {
    const url = new URL(input);

    if (url.hostname !== "open.spotify.com") {
      return null;
    }

    const pathParts = url.pathname.split("/").filter(Boolean);
    const baseIndex = pathParts[0]?.startsWith("intl-") ? 1 : 0;
    const kind = pathParts[baseIndex];
    const id = pathParts[baseIndex + 1];

    if ((kind === "track" || kind === "playlist") && id) {
      return { kind, id };
    }

    if (kind) {
      throw new SpotifyResolveError(
        "unsupported_type",
        "Only Spotify track and playlist links are supported.",
      );
    }

    return null;
  } catch (error) {
    if (error instanceof SpotifyResolveError) {
      throw error;
    }

    return null;
  }
}

async function fetchSpotifyEmbedEntity(kind: SpotifyInputKind, id: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`https://open.spotify.com/embed/${kind}/${id}`, {
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
    return payload;
  } catch (error) {
    if (error instanceof SpotifyResolveError) {
      throw error;
    }

    throw new SpotifyResolveError(
      "fetch_failed",
      error instanceof Error ? error.message : "Failed to fetch Spotify metadata.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function extractNextDataPayload(html: string): unknown {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  const payload = match?.[1];

  if (!payload) {
    throw new SpotifyResolveError("invalid_payload", "Spotify metadata payload was missing.");
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

function parseSpotifyPlaylistMetadata(
  payload: unknown,
  playlistId: string,
): SpotifyPlaylistMetadata | null {
  const entity = getNestedObject(payload, ["props", "pageProps", "state", "data", "entity"]);

  if (!entity) {
    return null;
  }

  const title = getString(entity.title) || getString(entity.name);
  const trackList = entity.trackList;

  if (!title || !Array.isArray(trackList)) {
    return null;
  }

  const tracks = trackList
    .map((track) => parseSpotifyPlaylistTrack(track))
    .filter((track): track is SpotifyPlaylistTrackMetadata => track !== null);

  return {
    playlistId,
    sourceUrl: `https://open.spotify.com/playlist/${playlistId}`,
    title,
    tracks,
  };
}

function parseSpotifyPlaylistTrack(track: unknown): SpotifyPlaylistTrackMetadata | null {
  const entity = getObject(track);

  if (!entity) {
    return null;
  }

  const uri = getString(entity.uri);
  const title = getString(entity.title);
  const artistText = getString(entity.subtitle) || "";
  const durationMs = getNumber(entity.duration) || 0;
  const entityType = getString(entity.entityType);
  const trackId = uri ? getSpotifyIdFromUri(uri, "track") : null;

  if (!title || !trackId || (entityType && entityType !== "track")) {
    return null;
  }

  return {
    trackId,
    sourceUrl: `https://open.spotify.com/track/${trackId}`,
    title,
    artistText,
    durationMs,
  };
}

function getSpotifyIdFromUri(uri: string, kind: SpotifyInputKind): string | null {
  const parts = uri.split(":");

  if (parts.length === 3 && parts[1] === kind && parts[2]) {
    return parts[2];
  }

  return null;
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
