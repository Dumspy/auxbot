import { registerInteraction } from "@auxbot/discord/interaction";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  SlashCommandBuilder,
  type ButtonInteraction,
} from "discord.js";
import { addSong } from "../grpc/client/player.js";
import { searchYouTube } from "../grpc/client/search.js";
import type { SearchYouTubeResponse } from "@auxbot/protos/search";
import { workerRegistry } from "../k8s.js";
import { formatDuration, isYouTubeUrl } from "../utils/youtube.js";
import { captureException } from "@auxbot/sentry";

const PAGE_SIZE = 5;
const INTERACTION_TIMEOUT_MS = 30_000;

interface SearchState {
  results: SearchYouTubeResponse["results"];
  page: number;
  query: string;
  guildId: string;
  userId: string;
  interaction: ChatInputCommandInteraction;
  hasMore: boolean;
  sessionId: string;
}

async function showSearchMenu(state: SearchState): Promise<void> {
  const { results, page, query, hasMore } = state;

  const embed = new EmbedBuilder().setTitle(`Search Results for: "${query}"`).setColor("#0099ff");

  if (results.length === 0) {
    embed.setDescription("No results found.");
    await state.interaction.editReply({ embeds: [embed], components: [] });
    return;
  }

  results.forEach((result: SearchYouTubeResponse["results"][number], index: number) => {
    embed.addFields({
      name: `${page * PAGE_SIZE + index + 1}. ${result.title}`,
      value: `Duration: ${result.duration != null ? formatDuration(result.duration) : "Live"} | Uploader: ${result.uploader}`,
    });
  });

  embed.setFooter({ text: `Page ${page + 1}` });

  const selectButtons = results.map(
    (result: SearchYouTubeResponse["results"][number], index: number) =>
      new ButtonBuilder()
        .setCustomId(`${state.sessionId}_select_${page * PAGE_SIZE + index}`)
        .setLabel(`${index + 1}`)
        .setStyle(ButtonStyle.Primary),
  );

  const navigationButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${state.sessionId}_prev`)
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`${state.sessionId}_next`)
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasMore),
    new ButtonBuilder()
      .setCustomId(`${state.sessionId}_cancel`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger),
  );

  const selectRow = new ActionRowBuilder<ButtonBuilder>().addComponents(selectButtons);

  const replyMessage = await state.interaction.editReply({
    embeds: [embed],
    components: [selectRow, navigationButtons],
  });

  if (!state.interaction.channel) {
    await state.interaction.editReply({
      embeds: [
        new EmbedBuilder().setTitle("Cannot show interactive menu here").setColor("#ff0000"),
      ],
      components: [],
    });
    return;
  }

  const collector = replyMessage.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: INTERACTION_TIMEOUT_MS,
    filter: (i) => i.user.id === state.userId && i.customId.startsWith(state.sessionId),
  });

  collector.on("collect", async (buttonInteraction: ButtonInteraction) => {
    await buttonInteraction.deferUpdate();

    const customId = buttonInteraction.customId;
    const customIdSuffix = customId.replace(`${state.sessionId}_`, "");

    if (customIdSuffix === "cancel") {
      await state.interaction.editReply({
        embeds: [new EmbedBuilder().setTitle("Search cancelled").setColor("#ff0000")],
        components: [],
      });
      collector.stop();
      return;
    }

    if (customIdSuffix === "prev") {
      state.page--;
      await updateSearchResults(state);
      collector.stop();
      return;
    }

    if (customIdSuffix === "next") {
      state.page++;
      await updateSearchResults(state);
      collector.stop();
      return;
    }

    if (customIdSuffix.startsWith("select_")) {
      const selectedIndex = Number.parseInt(customIdSuffix.split("_")[1] ?? "0", 10);
      const selectedResult = results.find(
        (_: SearchYouTubeResponse["results"][number], i: number) =>
          i + page * PAGE_SIZE === selectedIndex,
      );

      const disabledSelectButtons = results.map(
        (result: SearchYouTubeResponse["results"][number], index: number) =>
          new ButtonBuilder()
            .setCustomId(`${state.sessionId}_select_${page * PAGE_SIZE + index}`)
            .setLabel(`${index + 1}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
      );

      const disabledNavigationButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${state.sessionId}_prev`)
          .setLabel("Previous")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`${state.sessionId}_next`)
          .setLabel("Next")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`${state.sessionId}_cancel`)
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true),
      );

      const disabledSelectRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        disabledSelectButtons,
      );

      await state.interaction.editReply({
        embeds: [embed],
        components: [disabledSelectRow, disabledNavigationButtons],
      });

      if (selectedResult) {
        try {
          const response = await addSong(state.guildId, selectedResult.url, state.userId);

          await state.interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle(response.isPlaying ? "Now Playing" : "Added to Queue")
                .setDescription(selectedResult.title)
                .setColor(response.isPlaying ? "#00ff00" : "#ffff00"),
            ],
            components: [],
          });
        } catch (error) {
          captureException(error, {
            tags: {
              guildId: state.guildId,
              userId: state.userId,
              url: selectedResult.url,
              action: "add_song",
            },
          });
          await state.interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle("Failed to add song")
                .setDescription("Please try again later.")
                .setColor("#ff0000"),
            ],
            components: [],
          });
        }
      } else {
        await state.interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Failed to select song")
              .setDescription("The selected result could not be found.")
              .setColor("#ff0000"),
          ],
          components: [],
        });
      }

      collector.stop();
    }
  });

  collector.on("end", async (_: unknown, reason: string) => {
    if (reason === "time") {
      await state.interaction.editReply({
        embeds: [new EmbedBuilder().setTitle("Search timed out").setColor("#ff0000")],
        components: [],
      });
    }
  });
}

async function updateSearchResults(state: SearchState): Promise<void> {
  try {
    const response = await searchYouTube(state.guildId, state.query, state.page, PAGE_SIZE);
    state.results = response.results;
    state.hasMore = response.hasMore;
    await showSearchMenu(state);
  } catch (error) {
    captureException(error, {
      tags: {
        guildId: state.guildId,
        userId: state.userId,
        query: state.query,
        page: state.page,
        action: "search_youtube",
      },
    });
    await state.interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Failed to fetch results")
          .setDescription("Please try again later.")
          .setColor("#ff0000"),
      ],
      components: [],
    });
  }
}

registerInteraction({
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a song")
    .addStringOption((option) =>
      option
        .setName("song")
        .setDescription("The url of song to play or search query")
        .setRequired(true),
    ) as SlashCommandBuilder,
  async execute(interaction) {
    const songInput = interaction.options.getString("song", true);

    if (!interaction.guildId) {
      await interaction.reply("This command can only be used in a server.");
      return;
    }

    const worker = workerRegistry.getWorkersByGuild(interaction.guildId)[0];
    if (!worker) {
      await interaction.reply("No worker available for this server.");
      return;
    }

    if (isYouTubeUrl(songInput)) {
      try {
        await interaction.deferReply();
        const response = await addSong(interaction.guildId, songInput, interaction.user.id);
        await interaction.editReply(response.isPlaying ? "Now playing" : "Added to queue");
      } catch (error) {
        captureException(error, {
          tags: {
            guildId: interaction.guildId,
            userId: interaction.user.id,
            url: songInput,
            action: "add_song_direct",
          },
        });
        await interaction.reply("Failed to add song. Please try again later.");
      }
    } else {
      await interaction.deferReply();

      const state: SearchState = {
        results: [],
        page: 0,
        query: songInput,
        guildId: interaction.guildId,
        userId: interaction.user.id,
        interaction,
        hasMore: false,
        sessionId: `${interaction.id}-${Date.now()}`,
      };

      try {
        const response = await searchYouTube(interaction.guildId, songInput, 0, PAGE_SIZE);
        state.results = response.results;
        state.hasMore = response.hasMore;
        await showSearchMenu(state);
      } catch (error) {
        captureException(error, {
          tags: {
            guildId: interaction.guildId,
            userId: interaction.user.id,
            query: songInput,
            action: "search_youtube_initial",
          },
        });
        await interaction.editReply("Failed to search. Please try again later.");
      }
    }
  },
});
