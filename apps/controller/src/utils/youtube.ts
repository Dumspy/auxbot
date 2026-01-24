export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function isYouTubeUrl(input: string): boolean {
  const youtubePatterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=/,
    /^https?:\/\/(www\.)?youtu\.be\//,
    /^https?:\/\/(www\.)?youtube\.com\/shorts\//,
  ];

  return youtubePatterns.some((pattern) => pattern.test(input));
}
