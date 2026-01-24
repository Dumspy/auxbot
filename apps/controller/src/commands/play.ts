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

interface SearchState {
  results: SearchYouTubeResponse["results"];
  page: number;
  query: string;
  guildId: string;
  userId: string;
  interaction: ChatInputCommandInteraction;
  hasMore: boolean;
}

const searchSessions = new Map<string, SearchState>();

async function showSearchMenu(state: SearchState): Promise<void> {
  const { results, page, query, hasMore } = state;

  const embed = new EmbedBuilder()
    .setTitle(`Search Results for: "${query}"`)
    .setColor("#0099ff");

  if (results.length === 0) {
    embed.setDescription("No results found.");
    await state.interaction.editReply({ embeds: [embed], components: [] });
    searchSessions.delete(state.interaction.id);
    return;
  }

  results.forEach((result: SearchYouTubeResponse["results"][number], index: number) => {
    embed.addFields({
      name: `${page * 5 + index + 1}. ${result.title}`,
      value: `Duration: ${formatDuration(result.duration)} | Uploader: ${result.uploader}`,
    });
  });

  embed.setFooter({ text: `Page ${page + 1}` });

  const selectButtons = results.map((result: SearchYouTubeResponse["results"][number], index: number) =>
    new ButtonBuilder()
      .setCustomId(`select_${page * 5 + index}`)
      .setLabel(`${index + 1}`)
      .setStyle(ButtonStyle.Primary),
  );

  const navigationButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("prev")
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId("next")
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasMore),
    new ButtonBuilder()
      .setCustomId("cancel")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger),
  );

  const selectRow = new ActionRowBuilder<ButtonBuilder>().addComponents(selectButtons);

  await state.interaction.editReply({
    embeds: [embed],
    components: [selectRow, navigationButtons],
  });

  const collector = state.interaction.channel?.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 30000,
    filter: (i) => i.user.id === state.userId,
  });

  collector?.on("collect", async (buttonInteraction: ButtonInteraction) => {
    await buttonInteraction.deferUpdate();

    const customId = buttonInteraction.customId;

    if (customId === "cancel") {
      await state.interaction.editReply({
        embeds: [new EmbedBuilder().setTitle("Search cancelled").setColor("#ff0000")],
        components: [],
      });
      searchSessions.delete(state.interaction.id);
      collector.stop();
      return;
    }

    if (customId === "prev") {
      state.page--;
      await updateSearchResults(state);
      collector.stop();
      return;
    }

    if (customId === "next") {
      state.page++;
      await updateSearchResults(state);
      collector.stop();
      return;
    }

    if (customId.startsWith("select_")) {
      const selectedIndex = Number.parseInt(customId.split("_")[1] ?? "0", 10);
      const selectedResult = results.find(
        (_: SearchYouTubeResponse["results"][number], i: number) => i + page * 5 === selectedIndex,
      );

      if (selectedResult) {
        try {
          const response = await addSong(
            state.guildId,
            selectedResult.url,
            state.userId,
          );

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
          console.error("Error adding song:", error);
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
      }

      searchSessions.delete(state.interaction.id);
      collector.stop();
    }
  });

  collector?.on("end", async (_: unknown, reason: string) => {
    if (reason === "time") {
      await state.interaction.editReply({
        embeds: [new EmbedBuilder().setTitle("Search timed out").setColor("#ff0000")],
        components: [],
      });
      searchSessions.delete(state.interaction.id);
    }
  });
}

async function updateSearchResults(state: SearchState): Promise<void> {
  try {
    const response = await searchYouTube(state.guildId, state.query, state.page, 5);
    state.results = response.results;
    state.hasMore = response.hasMore;
    await showSearchMenu(state);
  } catch (error) {
    console.error("Error fetching search results:", error);
    await state.interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Failed to fetch results")
          .setDescription("Please try again later.")
          .setColor("#ff0000"),
      ],
      components: [],
    });
    searchSessions.delete(state.interaction.id);
  }
}

registerInteraction({
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a song")
    .addStringOption((option) =>
      option.setName("song").setDescription("The url of song to play or search query").setRequired(true),
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
        const response = await addSong(interaction.guildId, songInput, interaction.user.id);
        await interaction.reply(
          response.isPlaying ? "Now playing" : "Added to queue",
        );
      } catch {
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
      };

      searchSessions.set(interaction.id, state);

      try {
        const response = await searchYouTube(interaction.guildId, songInput, 0, 5);
        state.results = response.results;
        state.hasMore = response.hasMore;
        await showSearchMenu(state);
      } catch (error) {
        console.error("Error searching YouTube:", error);
        await interaction.editReply(
          "Failed to search. Please try again later.",
        );
        searchSessions.delete(interaction.id);
      }
    }
  },
});
