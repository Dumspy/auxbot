import express from 'express';
import { env } from './env.js'
import { captureException } from '@auxbot/sentry';

const app = express();
app.use(express.json());

export function getApp(): ReturnType<typeof express> {
    return app;
}

export function initApp(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const InitializeTimeout = setTimeout(() => {
            reject(new Error("Express app initialization timed out"));
        }, 10000); // 10 seconds timeout

        app.listen(env.PORT, () => {
            console.log(`Express server listening on port ${env.PORT}`);
            clearTimeout(InitializeTimeout);
            resolve();
        });
    });
}

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.get('/error', (req, res) => {

    try {
        //@ts-ignore
        foo();
    } catch (e) {
        //@ts-ignore
        captureException(e);
        console.error('Captured exception:', e);
    }
})