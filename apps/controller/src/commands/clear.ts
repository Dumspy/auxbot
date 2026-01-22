import { registerInteraction } from "@auxbot/discord/interaction";
import { SlashCommandBuilder } from "discord.js";
import { clearQueue } from "../grpc/client/player.js";
import { workerRegistry } from "../k8s.js";

registerInteraction({
  data: new SlashCommandBuilder().setName("clear").setDescription("Clear the music queue"),
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
      const response = await clearQueue(interaction.guildId);
      if (response.success) {
        await interaction.reply("Queue cleared successfully.");
      } else {
        await interaction.reply(response.message || "Failed to clear the queue.");
      }
    } catch {
      await interaction.reply("Failed to clear the queue. Please try again later.");
    }
  },
});
