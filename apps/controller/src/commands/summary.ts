import { registerInteraction } from "@auxbot/discord/interaction";
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { captureException } from "@auxbot/sentry";
import { generateSummary } from "../services/ai.js";
import {
  parseTimeframe,
  fetchMessagesInRange,
  formatMessages,
  timeframeSchema,
} from "../utils/messages.js";

const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_COOLDOWN = 60 * 1000;

function checkRateLimit(guildId: string, userId: string): boolean {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const lastRequest = rateLimitMap.get(key);

  if (lastRequest && now - lastRequest < RATE_LIMIT_COOLDOWN) {
    return false;
  }

  rateLimitMap.set(key, now);
  return true;
}

registerInteraction({
  data: new SlashCommandBuilder()
    .setName("summary")
    .setDescription("Generate a summary of recent messages in this channel")
    .addStringOption((option) =>
      option
        .setName("timeframe")
        .setDescription("Time period to summarize (e.g., 1h, 30m, 2d6h)")
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("limit")
        .setDescription("Maximum number of messages to include (default: 100)")
        .setMinValue(1)
        .setMaxValue(500),
    )
    .addBooleanOption((option) =>
      option
        .setName("ephemeral")
        .setDescription("Only show the summary to you (default: false)"),
    ) as SlashCommandBuilder,
  async execute(interaction) {
    const ephemeral = interaction.options.getBoolean("ephemeral") ?? false;
    await interaction.deferReply({ ephemeral });

    try {
      const guildId = interaction.guildId;
      if (!guildId) {
        await interaction.editReply(
          "This command can only be used in a server!",
        );
        return;
      }

      if (!checkRateLimit(guildId, interaction.user.id)) {
        await interaction.editReply(
          "Please wait before using this command again.",
        );
        return;
      }

      const channel = interaction.channel;
      if (!channel) {
        await interaction.editReply("Failed to get channel context.");
        return;
      }

      const timeframeString = interaction.options.getString("timeframe", true);
      const limit = interaction.options.getInteger("limit") ?? 100;

      if (limit < 1 || limit > 500) {
        await interaction.editReply(
          "Limit must be between 1 and 500 messages.",
        );
        return;
      }

      const timeframeResult = timeframeSchema.safeParse(timeframeString);
      if (!timeframeResult.success) {
        const firstError = timeframeResult.error.errors[0];
        await interaction.editReply(
          firstError?.message || "Invalid timeframe format",
        );
        return;
      }

      const MAX_TIMEFRAME_MS = 7 * 24 * 60 * 60 * 1000;
      const timeframe = parseTimeframe(timeframeString);

      if (timeframe.totalMs > MAX_TIMEFRAME_MS) {
        await interaction.editReply(
          "Timeframe exceeds maximum of 7 days. Please specify a shorter timeframe.",
        );
        return;
      }

      const messages = await fetchMessagesInRange(
        channel,
        timeframe.totalMs,
        limit,
      );

      if (messages.length === 0) {
        await interaction.editReply(
          "No messages found in the specified timeframe.",
        );
        return;
      }

      const MAX_PROMPT_SIZE = 50000;
      let formattedMessages = formatMessages(messages);

      if (formattedMessages.length > MAX_PROMPT_SIZE) {
        const truncatedLength = MAX_PROMPT_SIZE - 50;
        formattedMessages =
          "... (truncated to last messages)\n\n" +
          formattedMessages.slice(-truncatedLength);
      }

      const summary = await generateSummary(formattedMessages);

      const truncatedSummary =
        summary.length > 4096
          ? summary.slice(0, 4090) + "... (truncated)"
          : summary;

      const embed = new EmbedBuilder()
        .setTitle("Message Summary")
        .setDescription(truncatedSummary)
        .addFields(
          { name: "Channel", value: `<#${channel.id}>`, inline: true },
          { name: "Timeframe", value: timeframeString, inline: true },
          { name: "Messages", value: messages.length.toString(), inline: true },
        )
        .setColor("#0099ff")
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });
    } catch (error: any) {
      captureException(error, {
        tags: {
          command: "summary",
          guildId: interaction.guildId,
          channelId: interaction.channelId,
        },
      });

      let errorMessage = "Failed to generate summary. Please try again later.";

      if (error?.message?.includes("Missing permissions")) {
        errorMessage =
          "I don't have permission to read message history in this channel.";
      } else if (error?.message?.includes("AI request timeout")) {
        errorMessage =
          "AI summarization timed out. Try a smaller timeframe or limit.";
      }

      await interaction.editReply(errorMessage);
    }
  },
});
