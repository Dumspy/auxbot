import { env } from './env.js';
import { entersState, joinVoiceChannel, VoiceConnectionStatus, VoiceConnection } from '@discordjs/voice';
import { initClient, getClient } from './discord.js';
import { player } from './player.js';
import { initGrpc } from './grpc/index.js';
import { initSentry, captureException } from '@auxbot/sentry';
import { notifyReady } from './grpc/client/worker_lifecycle.js';

const client = getClient();
let voiceConnection: VoiceConnection | null = null;

async function boot() {
    try {
        // Initialize Sentry as early as possible
        initSentry({
            serverName: 'worker',
        });

        await initClient();
        console.log('Discord client initialized');
        
        // Initialize gRPC server
        await initGrpc();
        console.log('gRPC health check server initialized');
    } catch (error) {
        captureException(error, {
            tags: {
                function: 'boot',
            },
        });
    }
}

client.once('ready', async () => {
    console.log('Worker is ready');
    
    try {
        const guild = client.guilds.cache.get(env.DISCORD_GUILD_ID);
        if (!guild) {
            captureException(new Error(`Guild ${env.DISCORD_GUILD_ID} not found!`), {
                tags: {
                    function: 'client.once ready',
                },
            });
            return;
        }
        
        const channelId = env.DISCORD_CHANNEL_ID;
        console.log(`Attempting to join voice channel: ${channelId} in guild: ${guild.name}`);
        
        voiceConnection = joinVoiceChannel({
            channelId: channelId,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
        });

        // Subscribe the connection to our player instance
        voiceConnection.subscribe(player.getRawPlayer());

        await entersState(voiceConnection, VoiceConnectionStatus.Ready, 30_000);
        console.log('Successfully joined voice channel!');

        // Notify the controller that the worker is ready
        const acknowledged = await notifyReady(env.DISCORD_GUILD_ID);
        if (acknowledged) {
            console.log('Controller acknowledged worker readiness');
        } else {
            console.warn('Controller did not acknowledge worker readiness');
        }

    } catch (error) {
        captureException(error, {
            tags: {
                function: 'client.once ready',
            },
        });
    }
});

// Export the voice connection for use in other files
export function getVoiceConnection() {
    return voiceConnection;
}

boot()
