import { env } from './env.js';
import ytdl from 'ytdl-core';
import { AudioPlayerStatus, createAudioPlayer, createAudioResource, entersState, joinVoiceChannel, NoSubscriberBehavior, VoiceConnectionStatus } from '@discordjs/voice';
import { initClient, getClient } from './discord.js';
import { getPlayer } from './player.js';


const client = getClient();

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
        
        const connection = joinVoiceChannel({
            channelId: channelId,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
        });

        const player = getPlayer()
        connection.subscribe(player);

        await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    } catch (error) {
        console.error('Error joining voice channel:', error);
    }
});

async function boot(){
    await initClient();
    console.log('Discord client initialized');
}

boot()