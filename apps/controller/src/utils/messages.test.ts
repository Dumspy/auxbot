import { describe, it, expect } from "vitest";
import { parseTimeframe, formatMessages } from "./messages.js";

describe("messages utility", () => {
  describe("parseTimeframe", () => {
    it("should parse minutes correctly", () => {
      const result = parseTimeframe("30m");
      expect(result.totalMs).toBe(30 * 60 * 1000);
      expect(result.units).toEqual([{ value: 30, unit: "m" }]);
    });

    it("should parse hours correctly", () => {
      const result = parseTimeframe("1h");
      expect(result.totalMs).toBe(1 * 60 * 60 * 1000);
      expect(result.units).toEqual([{ value: 1, unit: "h" }]);
    });

    it("should parse days correctly", () => {
      const result = parseTimeframe("2d");
      expect(result.totalMs).toBe(2 * 24 * 60 * 60 * 1000);
      expect(result.units).toEqual([{ value: 2, unit: "d" }]);
    });

    it("should parse complex timeframes correctly", () => {
      const result = parseTimeframe("2d6h30m");
      const expectedMs = 2 * 24 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000 + 30 * 60 * 1000;
      expect(result.totalMs).toBe(expectedMs);
      expect(result.units).toEqual([
        { value: 2, unit: "d" },
        { value: 6, unit: "h" },
        { value: 30, unit: "m" },
      ]);
    });

    it("should throw error for invalid format", () => {
      expect(() => parseTimeframe("invalid")).toThrow("Invalid timeframe format");
    });
  });

  describe("formatMessages", () => {
    it("should format messages correctly", () => {
      const mockMessages = [
        {
          createdAt: new Date("2024-01-01T12:00:00Z"),
          author: { username: "user1" },
          content: "Hello world",
          attachments: new Map(),
        },
        {
          createdAt: new Date("2024-01-01T12:05:00Z"),
          author: { username: "user2" },
          content: "Hi there",
          attachments: new Map([["1", { name: "img.png" }]]),
        },
      ] as any;

      const formatted = formatMessages(mockMessages);
      expect(formatted).toContain("[2024-01-01T12:00:00.000Z] <@user1>: Hello world");
      expect(formatted).toContain("[2024-01-01T12:05:00.000Z] <@user2>: Hi there [img.png]");
    });
  });
});
