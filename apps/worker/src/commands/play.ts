import { registerInteraction } from '@auxbot/discord/interaction'
import { SlashCommandBuilder } from 'discord.js'
import { getQueue } from '../queue.js';
import { playNext } from '../player.js';

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
        
        const queue = getQueue();
        queue.add(songUrl);
        if (!queue.playing) {
            playNext();
        }

        await interaction.reply(`Added song: ${songUrl}`);
    }
})