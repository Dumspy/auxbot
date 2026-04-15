export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export type YouTubeInputKind = "video" | "playlist";

export function getYouTubeInputKind(input: string): YouTubeInputKind | null {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    return null;
  }

  const hostname = url.hostname.replace(/^www\./, "");

  if (hostname === "youtu.be") {
    return url.pathname.length > 1 ? "video" : null;
  }

  if (![
    "youtube.com",
    "music.youtube.com",
    "m.youtube.com",
  ].includes(hostname)) {
    return null;
  }

  if (url.pathname === "/playlist" && url.searchParams.has("list")) {
    return "playlist";
  }

  if (url.pathname === "/watch" && url.searchParams.has("v")) {
    return "video";
  }

  if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) {
    return "video";
  }

  return null;
}

export function isYouTubeUrl(input: string): boolean {
  return getYouTubeInputKind(input) !== null;
}

export function isYouTubePlaylistUrl(input: string): boolean {
  return getYouTubeInputKind(input) === "playlist";
}
