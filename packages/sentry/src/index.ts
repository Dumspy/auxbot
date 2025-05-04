import * as Sentry from '@sentry/node';
import { env } from './env.js';

interface InitOptions {
    serverName?: string;
    release?: string;
    tags?: Record<string, string>;
}

export function initSentry(options: InitOptions = {}) {
    if (!env.SENTRY_DSN) {
        console.warn('Sentry DSN not provided, error reporting will be disabled');
        return;
    }

    Sentry.init({
        dsn: env.SENTRY_DSN,
        environment: env.NODE_ENV,
        release: options.release,
        serverName: options.serverName,
        initialScope: {
            tags: options.tags,
        },
    });
}

export function captureException(error: Error, context?: Record<string, any>) {
    if (error instanceof Error) {
        Sentry.captureException(error, {
            extra: context,
        });
    } else {
        Sentry.captureMessage(String(error), {
            extra: context,
        });
    }
}

export function flush(): Promise<boolean> {
    return Sentry.flush();
}

// Re-export everything from Sentry for advanced usage
export * from '@sentry/node';