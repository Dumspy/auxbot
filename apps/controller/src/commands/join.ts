import { registerInteraction } from '@auxbot/discord/interaction'
import { SlashCommandBuilder } from 'discord.js'

registerInteraction({
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Join a voice channel')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The voice channel to join')
                .setRequired(true)
        ) as SlashCommandBuilder,
    async execute(interaction) {
        await interaction.deferReply()

        try {
            const channel = interaction.options.getChannel('channel')
            if (!channel) {
                await interaction.editReply('You need to specify a valid voice channel!')
                return
            }

            const guildId = interaction.guildId
            if (!guildId) {
                await interaction.editReply('This command can only be used in a server!')
                return
            }
            // Spawn worker pod with guild and channel info
            //const jobName = await spawnWorkerPod(guildId, channel.id)
            const jobName = 'test-job' // Placeholder for the actual job name
            await interaction.editReply(`Joining voice channel! Worker pod "${jobName}" spawned.`)
        } catch (error: any) {
            console.error('Error handling join command:', error)
            await interaction.editReply('Failed to join the channel: ' + (error.message || 'Unknown error'))
        }
    }
})