import * as chrono from "chrono-node";
import { DateTime } from "luxon";

export type Repeat = "never" | "daily" | "weekly";

export type ScheduleParseCode = "unparseable" | "past" | "bad_timezone";

export class ScheduleParseError extends Error {
  readonly code: ScheduleParseCode;

  constructor(code: ScheduleParseCode, message: string) {
    super(message);
    this.name = "ScheduleParseError";
    this.code = code;
  }
}

export function isValidTimezone(timezone: string): boolean {
  try {
    return DateTime.now().setZone(timezone).isValid;
  } catch {
    return false;
  }
}

export function parseReminderTime(when: string, timezone: string, repeat: Repeat): number {
  if (!isValidTimezone(timezone)) {
    throw new ScheduleParseError("bad_timezone", `Unknown timezone "${timezone}".`);
  }

  const nowMs = Date.now();
  const results = chrono.parse(when, new Date(nowMs), { forwardDate: true });
  const first = results[0];

  if (!first) {
    throw new ScheduleParseError(
      "unparseable",
      `I couldn't understand "${when}". Try "tomorrow at 9am" or "monday 10:00".`,
    );
  }

  const start = first.start;
  const wallClock =
    start.isCertain("hour") ||
    start.isCertain("day") ||
    start.isCertain("month") ||
    start.isCertain("year") ||
    start.isCertain("weekday");

  let fireMs: number;

  if (wallClock) {
    const year = start.get("year") ?? new Date(nowMs).getFullYear();
    const month = start.get("month") ?? 1;
    const day = start.get("day") ?? 1;
    const hour = start.get("hour") ?? 0;
    const minute = start.get("minute") ?? 0;
    const second = start.get("second") ?? 0;

    const dt = DateTime.fromObject(
      { year, month, day, hour, minute, second, millisecond: 0 },
      { zone: timezone },
    );

    if (!dt.isValid) {
      throw new ScheduleParseError(
        "unparseable",
        `I couldn't understand "${when}". Try "tomorrow at 9am" or "monday 10:00".`,
      );
    }

    fireMs = dt.toMillis();
  } else {
    fireMs = start.date().getTime();
  }

  if (repeat === "never") {
    if (fireMs <= nowMs) {
      throw new ScheduleParseError("past", "That time is already past.");
    }

    return fireMs;
  }

  if (fireMs <= nowMs) {
    const rolled = nextAfterFire(fireMs, repeat, timezone, nowMs);

    if (rolled === null) {
      throw new ScheduleParseError("past", "That time is already past.");
    }

    return rolled;
  }

  return fireMs;
}

export function nextAfterFire(
  prevFireMs: number,
  repeat: Repeat,
  timezone: string,
  nowMs: number = Date.now(),
): number | null {
  if (repeat === "never") {
    return null;
  }

  let dt = DateTime.fromMillis(prevFireMs).setZone(timezone);

  if (!dt.isValid) {
    dt = DateTime.fromMillis(prevFireMs, { zone: "utc" });
  }

  const step = repeat === "daily" ? { days: 1 } : { weeks: 1 };

  for (let i = 0; i < 10000; i++) {
    dt = dt.plus(step);

    if (dt.toMillis() > nowMs) {
      return dt.toMillis();
    }
  }

  return null;
}

export function formatDelay(delayMs: number): string {
  const totalMinutes = Math.max(1, Math.floor(delayMs / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes}m`);
  }

  return parts.join(" ");
}
