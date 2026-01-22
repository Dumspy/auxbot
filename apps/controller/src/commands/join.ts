import { registerInteraction } from "@auxbot/discord/interaction";
import { SlashCommandBuilder, ChannelType } from "discord.js";
import { spawnWorkerPod } from "../k8s.js";
import { captureException } from "@auxbot/sentry";

registerInteraction({
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("Join a voice channel")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The voice channel to join")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildVoice),
    ) as SlashCommandBuilder,
  async execute(interaction) {
    await interaction.deferReply();

    try {
      const channel = interaction.options.getChannel("channel");
      if (!channel) {
        await interaction.editReply(
          "You need to specify a valid voice channel!",
        );
        return;
      }

      if (channel.type !== ChannelType.GuildVoice) {
        await interaction.editReply(
          "The specified channel must be a voice channel!",
        );
        return;
      }

      const guildId = interaction.guildId;
      if (!guildId) {
        await interaction.editReply(
          "This command can only be used in a server!",
        );
        return;
      }

      // Spawn worker pod with guild and channel info
      const jobName = await spawnWorkerPod(guildId, channel.id);
      await interaction.editReply(
        `Joining voice channel ${channel.name}! Worker pod "${jobName}" spawned.`,
      );
    } catch (error: any) {
      captureException(error, {
        tags: {
          command: "join",
          guildId: interaction.guildId,
          channelId: interaction.options.getChannel("channel")?.id,
        },
      });
      await interaction.editReply(
        "Failed to join the channel: " + (error.message || "Unknown error"),
      );
    }
  },
});
