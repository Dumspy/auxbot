import { registerInteraction } from "@auxbot/discord/interaction";
import { captureException } from "@auxbot/sentry";
import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { env } from "../env.js";
import { getChannelReminderAllowlist } from "../services/redis.js";
import {
  createReminder,
  deleteReminder,
  listReminders,
  type ReminderTarget,
} from "../services/reminders.js";
import {
  ScheduleParseError,
  isValidTimezone,
  parseReminderTime,
  type Repeat,
} from "../utils/schedule.js";

const MAX_MESSAGE_LENGTH = 1500;
const LIST_LIMIT = 25;

function isRepeat(value: string): value is Repeat {
  return value === "never" || value === "daily" || value === "weekly";
}

function isTarget(value: string): value is ReminderTarget {
  return value === "me" || value === "here";
}

registerInteraction({
  data: new SlashCommandBuilder()
    .setName("remind")
    .setDescription("Schedule reminders")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create a reminder")
        .addStringOption((option) =>
          option.setName("message").setDescription("What to remind about").setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("when")
            .setDescription('When — e.g. "tomorrow at 9am", "monday 10:00", "in 2h"')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("repeat")
            .setDescription("Repetition (default: never)")
            .addChoices(
              { name: "never", value: "never" },
              { name: "daily", value: "daily" },
              { name: "weekly", value: "weekly" },
            ),
        )
        .addStringOption((option) =>
          option
            .setName("target")
            .setDescription("Where to send it (default: me)")
            .addChoices({ name: "me", value: "me" }, { name: "here", value: "here" }),
        )
        .addStringOption((option) =>
          option.setName("timezone").setDescription("IANA timezone (default: Europe/Copenhagen)"),
        ),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List your reminders"))
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Delete one of your reminders")
        .addStringOption((option) =>
          option.setName("id").setDescription("Reminder ID (see /remind list)").setRequired(true),
        ),
    ) as SlashCommandBuilder,
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === "create") {
        await handleCreate(interaction);
      } else if (subcommand === "list") {
        await handleList(interaction);
      } else if (subcommand === "delete") {
        await handleDelete(interaction);
      } else {
        await interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
      }
    } catch (error) {
      captureException(error, {
        tags: {
          command: "remind",
          subcommand,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
        },
      });

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply("Failed to process that. Please try again later.");
      } else {
        await interaction.reply({
          content: "Failed to process that. Please try again later.",
          ephemeral: true,
        });
      }
    }
  },
});

async function handleCreate(
  interaction: Parameters<Parameters<typeof registerInteraction>[0]["execute"]>[0],
): Promise<void> {
  const message = interaction.options.getString("message", true);
  const when = interaction.options.getString("when", true);
  const repeatOption = interaction.options.getString("repeat") ?? "never";
  const targetOption = interaction.options.getString("target") ?? "me";
  const timezone = interaction.options.getString("timezone") ?? env.DEFAULT_TIMEZONE;

  if (!isRepeat(repeatOption) || !isTarget(targetOption)) {
    await interaction.reply({ content: "Invalid repeat or target option.", ephemeral: true });
    return;
  }

  if (message.length === 0 || message.length > MAX_MESSAGE_LENGTH) {
    await interaction.reply({
      content: `Message must be 1–${MAX_MESSAGE_LENGTH} characters.`,
      ephemeral: true,
    });
    return;
  }

  if (targetOption === "here") {
    const allowlist = getChannelReminderAllowlist();

    if (!allowlist.has(interaction.user.id)) {
      await interaction.reply({
        content: "Only approved users can post channel reminders.",
        ephemeral: true,
      });
      return;
    }

    if (!interaction.guildId || !interaction.channelId) {
      await interaction.reply({
        content: "Channel reminders must be created from a server channel.",
        ephemeral: true,
      });
      return;
    }
  }

  if (!isValidTimezone(timezone)) {
    await interaction.reply({
      content: `Unknown timezone "${timezone}". Use an IANA name like "Europe/Copenhagen".`,
      ephemeral: true,
    });
    return;
  }

  let nextFireAt: number;

  try {
    nextFireAt = parseReminderTime(when, timezone, repeatOption);
  } catch (error) {
    if (error instanceof ScheduleParseError) {
      await interaction.reply({ content: error.message, ephemeral: true });
      return;
    }

    throw error;
  }

  try {
    const reminder = await createReminder({
      guildId: targetOption === "here" ? interaction.guildId : (interaction.guildId ?? null),
      channelId: targetOption === "here" ? interaction.channelId : null,
      creatorId: interaction.user.id,
      message,
      timezone,
      repeat: repeatOption,
      target: targetOption,
      nextFireAt,
    });

    const dueSeconds = Math.floor(reminder.nextFireAt / 1000);
    const where = targetOption === "here" ? `<#${reminder.channelId}>` : "your DMs";
    await interaction.reply({
      content: `Reminder set for <t:${dueSeconds}:F> in ${where} (repeats: ${repeatOption}).\nID: \`${reminder.id}\``,
      ephemeral: true,
    });
  } catch (error) {
    captureException(error, { tags: { command: "remind", subcommand: "create" } });
    await interaction.reply({
      content: "Reminders are temporarily unavailable. Please try again later.",
      ephemeral: true,
    });
  }
}

async function handleList(
  interaction: Parameters<Parameters<typeof registerInteraction>[0]["execute"]>[0],
): Promise<void> {
  let reminders;

  try {
    reminders = await listReminders(interaction.user.id);
  } catch (error) {
    captureException(error, { tags: { command: "remind", subcommand: "list" } });
    await interaction.reply({
      content: "Reminders are temporarily unavailable. Please try again later.",
      ephemeral: true,
    });
    return;
  }

  if (reminders.length === 0) {
    await interaction.reply({ content: "You have no reminders.", ephemeral: true });
    return;
  }

  const shown = reminders.slice(0, LIST_LIMIT);
  const embed = new EmbedBuilder().setTitle("Your reminders").setColor("#0099ff");

  for (const reminder of shown) {
    const preview =
      reminder.message.length > 80 ? reminder.message.slice(0, 77) + "..." : reminder.message;
    const dueSeconds = Math.floor(reminder.nextFireAt / 1000);
    const where = reminder.target === "here" ? `<#${reminder.channelId}>` : "DM";
    const status = reminder.status === "failed" ? " — ⚠️ failed" : "";
    embed.addFields({
      name: `⏰ ${preview}`,
      value: `ID: \`${reminder.id}\`\n${where} • ${reminder.repeat} • <t:${dueSeconds}:F>${status}`,
    });
  }

  if (reminders.length > LIST_LIMIT) {
    embed.setFooter({ text: `Showing ${LIST_LIMIT} of ${reminders.length}.` });
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleDelete(
  interaction: Parameters<Parameters<typeof registerInteraction>[0]["execute"]>[0],
): Promise<void> {
  const id = interaction.options.getString("id", true).trim();

  try {
    const deleted = await deleteReminder(interaction.user.id, id);

    if (!deleted) {
      await interaction.reply({
        content: "Reminder not found (or it isn't yours).",
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({ content: "Reminder deleted.", ephemeral: true });
  } catch (error) {
    captureException(error, { tags: { command: "remind", subcommand: "delete" } });
    await interaction.reply({
      content: "Reminders are temporarily unavailable. Please try again later.",
      ephemeral: true,
    });
  }
}
