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

const DURATION_UNIT_MS: Record<string, number> = {
  s: 1000,
  sec: 1000,
  secs: 1000,
  second: 1000,
  seconds: 1000,
  m: 60000,
  min: 60000,
  mins: 60000,
  minute: 60000,
  minutes: 60000,
  h: 3600000,
  hour: 3600000,
  hours: 3600000,
  d: 86400000,
  day: 86400000,
  days: 86400000,
  w: 604800000,
  week: 604800000,
  weeks: 604800000,
};

export function parseDurationMs(text: string): number | null {
  let rest = text.trim().toLowerCase();
  const inMatch = rest.match(/^in\s+(.+)$/);

  if (inMatch?.[1]) {
    rest = inMatch[1].trim();
  }

  if (rest.length === 0) {
    return null;
  }

  const compact = rest.replace(/\s+/g, "");
  const tokenRe = /(\d+|an?)(seconds?|secs?|minutes?|mins?|hours?|days?|weeks?|s|m|h|d|w)/g;
  let total = 0;
  let covered = "";
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(compact)) !== null) {
    const amountStr = match[1];
    const unitStr = match[2];

    if (amountStr === undefined || unitStr === undefined) {
      return null;
    }

    const amount = amountStr === "a" || amountStr === "an" ? 1 : Number(amountStr);
    const unitMs = DURATION_UNIT_MS[unitStr];

    if (!isFinite(amount) || unitMs === undefined) {
      return null;
    }

    covered += match[0];
    total += amount * unitMs;
  }

  if (covered !== compact || total <= 0) {
    return null;
  }

  return total;
}

export function parseReminderTime(when: string, timezone: string, repeat: Repeat): number {
  if (!isValidTimezone(timezone)) {
    throw new ScheduleParseError("bad_timezone", `Unknown timezone "${timezone}".`);
  }

  const nowMs = Date.now();
  const durationMs = parseDurationMs(when);

  if (durationMs !== null) {
    return nowMs + durationMs;
  }

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
