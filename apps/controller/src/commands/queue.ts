import { registerInteraction } from '@auxbot/discord/interaction'
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js'
import { getQueueStatus } from '../grpc/player.js';
import { workerRegistry } from '../k8s.js';
import { env } from '../env.js';

registerInteraction({
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current music queue'),
    async execute(interaction) {
        if (!interaction.guildId) {
            await interaction.reply('This command can only be used in a server.');
            return;
        }

        const worker = workerRegistry.getWorkersByGuild(interaction.guildId)[0];
        if (!worker) {
            await interaction.reply('No worker available for this server.');
            return;
        }

        const workerAddress = worker.podIp + ':' + env.WORKER_GRPC_PORT;

        try {
            const response = await getQueueStatus(workerAddress);
            
            const embed = new EmbedBuilder()
                .setTitle('Music Queue')
                .setColor('#0099ff');
            
            if (response.isPlaying && response.nowPlayingUrl) {
                embed.addFields({ 
                    name: '🎵 Now Playing', 
                    value: `[Link](${response.nowPlayingUrl}) | Requested by <@${response.nowPlayingRequester}>`
                });
            } else {
                embed.addFields({ name: '🎵 Now Playing', value: 'Nothing is currently playing' });
            }
            
            if (response.items.length > 0) {
                const queueList = response.items
                    .map((item, index) => `${index + 1}. [Link](${item.url}) | Requested by <@${item.requesterId}>`)
                    .join('\n');
                
                embed.addFields({ name: '📋 Queue', value: queueList });
            } else {
                embed.addFields({ name: '📋 Queue', value: 'The queue is empty' });
            }
            
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            await interaction.reply('Failed to get queue information. Please try again later.');
        }
    }
})