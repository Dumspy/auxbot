import { registerInteraction } from "@auxbot/discord/interaction";
import { SlashCommandBuilder } from "discord.js";

registerInteraction({
  data: new SlashCommandBuilder()
    .setName("kill")
    .setDescription("Kill the worker") as SlashCommandBuilder,
  async execute(interaction) {
    await interaction.reply("Worker has been killed.");

    process.exit(0);
  },
});
