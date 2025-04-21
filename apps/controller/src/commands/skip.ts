import { registerInteraction } from '@auxbot/discord/interaction'
import { SlashCommandBuilder } from 'discord.js'
import { skipSong } from '../grpc/player.js';
import { workerRegistry } from '../k8s.js';
import { env } from '../env.js';

registerInteraction({
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current song'),
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
            const response = await skipSong(workerAddress);
            
            if (response.success) {
                await interaction.reply('Skipped to the next song!');
            } else {
                await interaction.reply(response.message || 'Nothing is currently playing.');
            }
        } catch (error) {
            await interaction.reply('Failed to skip song. Please try again later.');
        }
    }
})