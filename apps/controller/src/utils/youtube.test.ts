import { describe, it, expect } from "vitest";
import { formatDuration, isYouTubeUrl } from "./youtube.js";

describe("YouTube utility", () => {
  describe("formatDuration", () => {
    it("should format seconds into M:SS", () => {
      expect(formatDuration(65)).toBe("1:05");
      expect(formatDuration(59)).toBe("0:59");
    });

    it("should format hours correctly", () => {
      expect(formatDuration(3661)).toBe("1:01:01");
      expect(formatDuration(7200)).toBe("2:00:00");
    });
  });

  describe("isYouTubeUrl", () => {
    it("should identify valid YouTube URLs", () => {
      expect(isYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
      expect(isYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
      expect(isYouTubeUrl("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe(true);
    });

    it("should return false for non-YouTube URLs", () => {
      expect(isYouTubeUrl("https://google.com")).toBe(false);
      expect(isYouTubeUrl("not a url")).toBe(false);
    });
  });
});
