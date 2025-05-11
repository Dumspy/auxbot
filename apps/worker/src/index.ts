import { env } from './env.js';
import { entersState, joinVoiceChannel, VoiceConnectionStatus, VoiceConnection } from '@discordjs/voice';
import { initClient, getClient } from './discord.js';
import { player } from './player.js';
import { initGrpc } from './grpc/index.js';
import { initSentry, captureException } from '@auxbot/sentry';
import { Events } from 'discord.js';

const client = getClient();
let voiceConnection: VoiceConnection | null = null;

async function boot() {
    try {
        initSentry({
            serverName: 'worker',
        });

        await initClient();
        console.log('Discord client initialized');
        
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

client.once(Events.ClientReady, async () => {
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

        voiceConnection.subscribe(player.getRawPlayer());

        await entersState(voiceConnection, VoiceConnectionStatus.Ready, 30_000);
        console.log('Successfully joined voice channel!');

    } catch (error) {
        console.error('Error during voice channel connection:', error);

        captureException(error, {
            tags: {
                function: 'client.once ready',
            },
        });
    }
});

export function getVoiceConnection() {
    return voiceConnection;
}

boot()
