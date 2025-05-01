import { registerInteraction } from '@auxbot/discord/interaction'
import { SlashCommandBuilder } from 'discord.js'
import { pausePlayback } from '../grpc/client/player.js';
import { workerRegistry } from '../k8s.js';

registerInteraction({
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause the current playback'),
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

        try {
            const response = await pausePlayback(interaction.guildId);
            if (response.success) {
                await interaction.reply('Playback paused.');
            } else {
                await interaction.reply(response.message || 'Cannot pause: No active playback.');
            }
        } catch (error) {
            await interaction.reply('Failed to pause playback. Please try again later.');
        }
    }
})