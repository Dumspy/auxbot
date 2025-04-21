import { initApp } from './express.js';
import { initClient } from './discord.js';
import { workerRegistry } from './k8s.js';
import { env } from './env.js';
import { checkWorkerHealth } from './grpc/health.js';

// Function to check worker health
async function checkHealth() {
    const workerAddress = `${env.WORKER_GRPC_HOST}:${env.WORKER_GRPC_PORT}`;
    try {
        const isHealthy = await checkWorkerHealth(workerAddress);
        console.log(`Worker health check result: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);
        return isHealthy;
    } catch (error) {
        console.error('Error during health check:', error);
        return false;
    }
}

async function boot() {
    await initApp();
    console.log('Express app initialized');

    await initClient();
    console.log('Discord client initialized');
    
    // Perform an initial health check
    const initialHealth = await checkHealth();
    console.log(`Initial worker health check: ${initialHealth ? 'HEALTHY' : 'UNHEALTHY'}`);
    
    // Set up periodic health checks (every 30 seconds)
    setInterval(checkHealth, 30000);

    // Log worker health status every minute
    setInterval(() => {
        const workers = workerRegistry.getAllWorkers();
        console.log(`Worker health status (${workers.length} workers):`);
        
        if (workers.length === 0) {
            console.log('No active workers');
            return;
        }
        
        workers.forEach(worker => {
            console.log(`- Worker ${worker.job.metadata?.name} (guild: ${worker.guildId}): ${worker.healthy ? 'HEALTHY' : 'UNHEALTHY'}`);
        });
    }, 60000);
}

boot().catch(err => {
    console.error('Error during boot:', err);
    process.exit(1);
});