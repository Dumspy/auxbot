import { env } from './env.js';
import { entersState, joinVoiceChannel, VoiceConnectionStatus, VoiceConnection } from '@discordjs/voice';
import { initClient, getClient } from './discord.js';
import { player } from './player.js';
import { initGrpc } from './grpc/index.js';
import { initSentry } from '@auxbot/sentry';

const client = getClient();
let voiceConnection: VoiceConnection | null = null;

async function boot() {
    // Initialize Sentry as early as possible
    initSentry({
        serverName: 'worker',
    });

    await initClient();
    console.log('Discord client initialized');
    
    // Initialize gRPC server
    await initGrpc();
    console.log('gRPC health check server initialized');
}

client.once('ready', async () => {
    console.log('Worker is ready');
    
    try {
        const guild = client.guilds.cache.get(env.DISCORD_GUILD_ID);
        if (!guild) {
            console.error(`Guild ${env.DISCORD_GUILD_ID} not found!`);
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

    } catch (error) {
        console.error('Error joining voice channel:', error);
    }
});

// Export the voice connection for use in other files
export function getVoiceConnection() {
    return voiceConnection;
}

boot()