import express from 'express';
import { env } from './env.js'
import { captureException, flush } from '@auxbot/sentry';

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
    console.log('Received request to /error endpoint');
    try {
        throw new Error('Test error for Sentry');
    } catch (e) {
        console.log('Attempting to capture error in Sentry...');
        captureException(e as Error);
        console.log('Error captured, flushing to Sentry...');
        
        // Ensure the event is sent to Sentry before responding
        flush(2000).then(() => {
            console.log('Sentry flush complete');
            res.status(500).json({ error: 'Test error sent to Sentry' });
        }).catch((err) => {
            console.error('Error flushing to Sentry:', err);
            res.status(500).json({ error: 'Error sending to Sentry' });
        });
    }
});