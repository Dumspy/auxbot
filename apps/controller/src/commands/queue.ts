import { registerInteraction } from "@auxbot/discord/interaction";
import { EmbedBuilder, SlashCommandBuilder, escapeMarkdown } from "discord.js";
import { getQueueStatus } from "../grpc/client/player.js";
import { workerRegistry } from "../k8s.js";

const MAX_QUEUE_FIELD_LENGTH = 1024;

function formatQueueItem(
  title: string,
  artistText: string,
  url: string,
  requesterId: string,
): string {
  const label = title ? `${title}${artistText ? ` - ${artistText}` : ""}` : "Link";
  return `[${escapeMarkdown(label)}](${url}) | Requested by <@${requesterId}>`;
}

function buildQueueFieldValue(lines: string[]): string {
  const shownLines: string[] = [];

  for (const line of lines) {
    const nextValue = [...shownLines, line].join("\n");

    if (nextValue.length > MAX_QUEUE_FIELD_LENGTH) {
      break;
    }

    shownLines.push(line);
  }

  if (shownLines.length === 0) {
    return "Queue is too long to display.";
  }

  if (shownLines.length === lines.length) {
    return shownLines.join("\n");
  }

  const remainingCount = lines.length - shownLines.length;
  const suffix = `\n...and ${remainingCount} more`;
  let value = shownLines.join("\n");

  if (value.length + suffix.length > MAX_QUEUE_FIELD_LENGTH) {
    while (
      shownLines.length > 0 &&
      `${shownLines.join("\n")}${suffix}`.length > MAX_QUEUE_FIELD_LENGTH
    ) {
      shownLines.pop();
    }

    value = shownLines.join("\n");
  }

  return value ? `${value}${suffix}` : suffix.trimStart();
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
        const queueLines = response.items.map(
          (item, index) =>
            `${index + 1}. ${formatQueueItem(item.title, item.artistText, item.url, item.requesterId)}`,
        );

        embed.addFields({ name: "📋 Queue", value: buildQueueFieldValue(queueLines) });
      } else {
        embed.addFields({ name: "📋 Queue", value: "The queue is empty" });
      }

      await interaction.reply({ embeds: [embed] });
    } catch {
      await interaction.reply("Failed to get queue information. Please try again later.");
    }
  },
});
