import { registerInteraction } from "@auxbot/discord/interaction";
import { SlashCommandBuilder } from "discord.js";
import { skipSong } from "../grpc/client/player.js";
import { workerRegistry } from "../k8s.js";

registerInteraction({
  data: new SlashCommandBuilder().setName("skip").setDescription("Skip the current song"),
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply("This command can only be used in a server.");
      return;
    }

    const worker = workerRegistry.getWorkersByGuild(interaction.guildId)[0];
    if (!worker) {
      await interaction.reply("No worker available for this server.");
      return;
    }

    try {
      const response = await skipSong(interaction.guildId);
      if (response.success) {
        await interaction.reply(response.message);
      } else {
        await interaction.reply(response.message || "Nothing is currently playing.");
      }
    } catch {
      await interaction.reply("Failed to skip song. Please try again later.");
    }
  },
});
