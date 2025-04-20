import { initApp } from './express.js';
import { initClient } from './discord.js';
import './k8s.js'

async function boot() {
    await initApp();
    console.log('Express app initialized');

    await initClient();
    console.log('Discord client initialized');
}

boot().catch(err => {
    console.error('Error during boot:', err);
    process.exit(1);
});