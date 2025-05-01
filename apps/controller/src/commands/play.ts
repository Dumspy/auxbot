import { registerInteraction } from '@auxbot/discord/interaction'
import { SlashCommandBuilder } from 'discord.js'
import { addSong } from '../grpc/client/player.js';
import { workerRegistry } from '../k8s.js';

registerInteraction({
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song')
        .addStringOption(option =>
            option.setName('song')
                .setDescription('The url of the song to play')
                .setRequired(true)
        ) as SlashCommandBuilder,
    async execute(interaction) {
        const songUrl = interaction.options.getString('song', true);
        const regex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
        if (!regex.test(songUrl)) {
            await interaction.reply('Please provide a valid YouTube URL.');
            return;
        }

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
            const response = await addSong(interaction.guildId, songUrl, interaction.user.id);
            await interaction.reply(`Added song: ${response.isPlaying ? 'Playing now' : 'Added to queue'}`);
        } catch (error) {
            await interaction.reply('Failed to add song. Please try again later.');
        }
    }
})