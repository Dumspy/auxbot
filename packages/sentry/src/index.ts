import * as Sentry from "@sentry/node";
import { env } from "./env.js";

interface InitOptions {
  serverName?: string;
  release?: string;
  tags?: Record<string, string>;
}

export function initSentry(options: InitOptions = {}) {
  console.log("Initializing Sentry with options:", options);
  console.log("SENTRY_DSN:", env.SENTRY_DSN ? "Set" : "Not set");
  console.log("NODE_ENV:", env.NODE_ENV);

  if (!env.SENTRY_DSN) {
    console.warn("Sentry DSN not provided, error reporting will be disabled");
    return;
  }

  try {
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      // release: options.release,
      // serverName: options.serverName,
      // initialScope: {
      //     tags: options.tags,
      // },
      debug: true, // Enable debug logging
    });
    console.log("Sentry initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Sentry:", error);
  }
}

export function captureException(error: Error | unknown, context?: Record<string, any>) {
  console.error("Error captured:", error, context ? { context } : "");

  if (!env.SENTRY_DSN) {
    return;
  }

  Sentry.captureException(error, {
    extra: context,
  });
}

export function flush(timeout?: number): Promise<boolean> {
  return Sentry.flush(timeout);
}
