import { registerInteraction } from '@auxbot/discord/interaction'
import { SlashCommandBuilder } from 'discord.js'
import { resumePlayback } from '../grpc/client/player.js';
import { workerRegistry } from '../k8s.js';

registerInteraction({
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resume the paused playback'),
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
            const response = await resumePlayback(interaction.guildId);
            if (response.success) {
                await interaction.reply('Playback resumed.');
            } else {
                await interaction.reply(response.message || 'Cannot resume: No paused playback.');
            }
        } catch (error) {
            await interaction.reply('Failed to resume playback. Please try again later.');
        }
    }
})