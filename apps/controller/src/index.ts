import { initSentry, captureException} from '@auxbot/sentry';
import { initApp } from './express.js';
import { initClient } from './discord.js';
import { workerRegistry } from './k8s.js';
import { initGrpc } from './grpc/index.js';
import { env } from './env.js';

// Initialize Sentry as early as possible
initSentry({
    serverName: 'controller',
});

async function boot() {
    try {
        await initApp();
        console.log('Express app initialized');

        await initClient();
        console.log('Discord client initialized');
        
        await initGrpc();
        console.log('gRPC server initialized');
        
        // Log worker health status every minute
        setInterval(() => {
            const workers = workerRegistry.getAllWorkers();
            console.log(`Worker health status (${workers.length} workers):`);
            
            if (workers.length === 0) {
                console.log('No active workers');
                return;
            }
            
            workers.forEach(worker => {
                console.log(`- Worker ${worker.pod.metadata?.name} (guild: ${worker.guildId}): ${worker.healthy ? 'HEALTHY' : 'UNHEALTHY'}`);
            });
        }, 60000);
    } catch (error) {
        console.error('Error during boot:', error);
        throw error;
    }
}

boot().catch(err => {
    console.error('Error during boot:', err);
    process.exit(1);
});

// Sentry debug

try {
    //@ts-ignore
  foo();
} catch (e) {
    //@ts-ignore
  captureException(e);
  console.error('Captured exception:', e);
}