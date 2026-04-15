import { registerInteraction } from "@auxbot/discord/interaction";
import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { getQueueStatus } from "../grpc/client/player.js";
import { workerRegistry } from "../k8s.js";

function formatQueueItem(
  title: string,
  artistText: string,
  url: string,
  requesterId: string,
): string {
  const label = title ? `${title}${artistText ? ` - ${artistText}` : ""}` : "Link";
  return `[${label}](${url}) | Requested by <@${requesterId}>`;
}

registerInteraction({
  data: new SlashCommandBuilder().setName("queue").setDescription("Show the current music queue"),
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
      const response = await getQueueStatus(interaction.guildId);

      const embed = new EmbedBuilder().setTitle("Music Queue").setColor("#0099ff");

      if (response.isPlaying && response.nowPlayingUrl) {
        const nowPlayingLabel = formatQueueItem(
          response.nowPlayingTitle,
          response.nowPlayingArtistText,
          response.nowPlayingUrl,
          response.nowPlayingRequester,
        );

        embed.addFields({
          name: "🎵 Now Playing",
          value: nowPlayingLabel,
        });
      } else {
        embed.addFields({
          name: "🎵 Now Playing",
          value: "Nothing is currently playing",
        });
      }

      if (response.items.length > 0) {
        const queueList = response.items
          .map(
            (item, index) =>
              `${index + 1}. ${formatQueueItem(item.title, item.artistText, item.url, item.requesterId)}`,
          )
          .join("\n");

        embed.addFields({ name: "📋 Queue", value: queueList });
      } else {
        embed.addFields({ name: "📋 Queue", value: "The queue is empty" });
      }

      await interaction.reply({ embeds: [embed] });
    } catch {
      await interaction.reply("Failed to get queue information. Please try again later.");
    }
  },
});
