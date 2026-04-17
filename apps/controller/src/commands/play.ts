import { registerInteraction } from "@auxbot/discord/interaction";
import { SongSource } from "@auxbot/protos/player";
import type { SearchYouTubeResponse } from "@auxbot/protos/search";
import { captureException } from "@auxbot/sentry";
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
import { resolveYouTubePlaylist, searchYouTube } from "../grpc/client/search.js";
import { workerRegistry } from "../k8s.js";
import {
  getSpotifyInputKind,
  type SpotifyPlaylistMetadata,
  SpotifyResolveError,
  resolveSpotifyPlaylist,
  type SpotifyBaseTrackMetadata,
  resolveSpotifyTrack,
  type SpotifyTrackMetadata,
} from "../services/spotify.js";
import { formatDuration, getYouTubeInputKind } from "../utils/youtube.js";

const PAGE_SIZE = 5;
const PLAYLIST_BATCH_SIZE = 10;
const INTERACTION_TIMEOUT_MS = 30_000;
const FILTERED_TERMS = ["live", "karaoke", "instrumental", "cover", "remix", "nightcore"];

interface SelectedSongMetadata {
  sourceUrl: string;
  title: string;
  artistText: string;
  source: SongSource;
}

interface SearchState {
  results: SearchYouTubeResponse["results"];
  page: number;
  query: string;
  searchLabel: string;
  guildId: string;
  userId: string;
  interaction: ChatInputCommandInteraction;
  hasMore: boolean;
  sessionId: string;
  selectedSongMetadata?: SelectedSongMetadata;
}

interface PlaylistImportCounts {
  processed: number;
  queued: number;
  skipped: number;
  startedPlaying: boolean;
}

function createSuccessEmbed(isPlaying: boolean, title: string, artistText?: string): EmbedBuilder {
  const description = artistText ? `${title} - ${artistText}` : title;

  return new EmbedBuilder()
    .setTitle(isPlaying ? "Now Playing" : "Added to Queue")
    .setDescription(description)
    .setColor(isPlaying ? "#00ff00" : "#ffff00");
}

function createPlaylistStatusEmbed(
  sourceLabel: string,
  playlistTitle: string,
  counts: PlaylistImportCounts,
  status: "progress" | "complete" | "empty",
  totalCount?: number,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(
      status === "progress"
        ? `Importing ${sourceLabel} Playlist`
        : status === "empty"
          ? `No Playable ${sourceLabel} Tracks Found`
          : `Imported ${sourceLabel} Playlist`,
    )
    .setColor(status === "empty" ? "#ff0000" : status === "progress" ? "#0099ff" : "#00ff00")
    .addFields(
      {
        name: "Playlist",
        value: playlistTitle,
      },
      {
        name: "Processed",
        value: totalCount != null ? `${counts.processed}/${totalCount}` : `${counts.processed}`,
        inline: true,
      },
      {
        name: "Queued",
        value: `${counts.queued}`,
        inline: true,
      },
      {
        name: "Skipped",
        value: `${counts.skipped}`,
        inline: true,
      },
    );

  if (counts.startedPlaying && status !== "progress") {
    embed.setFooter({ text: "The first queued track started playing immediately." });
  }

  return embed;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getTokens(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1);
}

function buildSpotifySearchQuery(track: SpotifyBaseTrackMetadata): string {
  return `${track.artistText} ${track.title} audio`.trim();
}

function scoreSearchResult(
  track: SpotifyBaseTrackMetadata,
  result: SearchYouTubeResponse["results"][number],
): number {
  const normalizedResultTitle = normalizeText(result.title);
  const normalizedTrackTitle = normalizeText(track.title);
  const titleTokens = getTokens(track.title);
  const artistTokens = getTokens(track.artistText);
  const matchedTitleTokens = titleTokens.filter((token) =>
    normalizedResultTitle.includes(token),
  ).length;
  const matchedArtistTokens = artistTokens.filter((token) =>
    normalizedResultTitle.includes(token),
  ).length;
  const spotifyDuration = Math.round(track.durationMs / 1000);
  const durationDiff = result.duration > 0 ? Math.abs(result.duration - spotifyDuration) : null;

  let score = 0;

  score += matchedTitleTokens * 2;
  score += matchedArtistTokens;

  if (matchedTitleTokens === 0) {
    score -= 4;
  }

  if (matchedArtistTokens === 0) {
    score -= 2;
  }

  if (durationDiff !== null) {
    if (durationDiff <= 5) {
      score += 3;
    } else if (durationDiff <= 15) {
      score += 1;
    } else if (durationDiff >= 45) {
      score -= 3;
    }
  }

  for (const filteredTerm of FILTERED_TERMS) {
    if (
      normalizedResultTitle.includes(filteredTerm) &&
      !normalizedTrackTitle.includes(filteredTerm)
    ) {
      score -= 2;
    }
  }

  return score;
}

function findConfidentSpotifyMatch(
  track: SpotifyBaseTrackMetadata,
  results: SearchYouTubeResponse["results"],
): SearchYouTubeResponse["results"][number] | null {
  const scoredResults = results
    .map((result) => ({ result, score: scoreSearchResult(track, result) }))
    .sort((left, right) => right.score - left.score);

  const bestResult = scoredResults[0];

  if (!bestResult || bestResult.score < 4) {
    return null;
  }

  return bestResult.result;
}

function buildSongPayload(
  userId: string,
  result: SearchYouTubeResponse["results"][number],
  metadata?: SelectedSongMetadata,
) {
  return {
    playbackUrl: result.url,
    requesterId: userId,
    sourceUrl: metadata?.sourceUrl || result.url,
    title: metadata?.title || result.title,
    artistText: metadata?.artistText || result.uploader,
    source: metadata?.source ?? SongSource.SONG_SOURCE_YOUTUBE,
  };
}

async function showSearchMenu(state: SearchState): Promise<void> {
  const { results, page, searchLabel, hasMore } = state;

  const embed = new EmbedBuilder()
    .setTitle(`Search Results for: "${searchLabel}"`)
    .setColor("#0099ff");

  if (results.length === 0) {
    embed.setDescription("No results found.");
    await state.interaction.editReply({ embeds: [embed], components: [] });
    return;
  }

  results.forEach((result, index) => {
    embed.addFields({
      name: `${page * PAGE_SIZE + index + 1}. ${result.title}`,
      value: `Duration: ${result.duration != null ? formatDuration(result.duration) : "Live"} | Uploader: ${result.uploader}`,
    });
  });

  embed.setFooter({ text: `Page ${page + 1}` });

  const selectButtons = results.map((_, index) =>
    new ButtonBuilder()
      .setCustomId(`${state.sessionId}_select_${page * PAGE_SIZE + index}`)
      .setLabel(`${page * PAGE_SIZE + index + 1}`)
      .setStyle(ButtonStyle.Primary),
  );

  const navigationButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${state.sessionId}_prev`)
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`${state.sessionId}_page`)
      .setLabel(`Page ${page + 1}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
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
    filter: (interaction) =>
      interaction.user.id === state.userId && interaction.customId.startsWith(state.sessionId),
  });

  collector.on("collect", async (buttonInteraction: ButtonInteraction) => {
    await buttonInteraction.deferUpdate();

    const customIdSuffix = buttonInteraction.customId.replace(`${state.sessionId}_`, "");

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

    if (!customIdSuffix.startsWith("select_")) {
      return;
    }

    const selectedIndex = Number.parseInt(customIdSuffix.split("_")[1] ?? "0", 10);
    const selectedResult = results.find((_, index) => index + page * PAGE_SIZE === selectedIndex);
    const disabledSelectButtons = results.map((_, index) =>
      new ButtonBuilder()
        .setCustomId(`${state.sessionId}_select_${page * PAGE_SIZE + index}`)
        .setLabel(`${page * PAGE_SIZE + index + 1}`)
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
        .setCustomId(`${state.sessionId}_page`)
        .setLabel(`Page ${page + 1}`)
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

    if (!selectedResult) {
      await state.interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Failed to select song")
            .setDescription("The selected result could not be found.")
            .setColor("#ff0000"),
        ],
        components: [],
      });
      collector.stop();
      return;
    }

    try {
      const song = buildSongPayload(state.userId, selectedResult, state.selectedSongMetadata);
      const response = await addSong(state.guildId, song);

      await state.interaction.editReply({
        embeds: [createSuccessEmbed(response.isPlaying, song.title, song.artistText)],
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

    collector.stop();
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

async function handleYouTubePlaylist(
  interaction: ChatInputCommandInteraction,
  playlistUrl: string,
): Promise<void> {
  const counts: PlaylistImportCounts = {
    processed: 0,
    queued: 0,
    skipped: 0,
    startedPlaying: false,
  };
  let offset = 0;
  let playlistTitle = "YouTube Playlist";

  try {
    while (true) {
      const response = await resolveYouTubePlaylist(
        interaction.guildId!,
        playlistUrl,
        offset,
        PLAYLIST_BATCH_SIZE,
      );

      if (response.title) {
        playlistTitle = response.title;
      }

      if (response.items.length === 0 && counts.processed === 0) {
        await interaction.editReply({
          embeds: [createPlaylistStatusEmbed("YouTube", playlistTitle, counts, "empty")],
        });
        return;
      }

      for (const item of response.items) {
        counts.processed++;

        try {
          const addSongResponse = await addSong(
            interaction.guildId!,
            buildSongPayload(interaction.user.id, item),
          );
          counts.queued++;
          counts.startedPlaying ||= addSongResponse.isPlaying;
        } catch (error) {
          counts.skipped++;
          captureException(error, {
            tags: {
              guildId: interaction.guildId,
              userId: interaction.user.id,
              url: item.url,
              action: "add_youtube_playlist_item",
            },
          });
        }
      }

      await interaction.editReply({
        embeds: [createPlaylistStatusEmbed("YouTube", playlistTitle, counts, "progress")],
      });

      if (!response.hasMore) {
        break;
      }

      offset += PLAYLIST_BATCH_SIZE;
    }

    await interaction.editReply({
      embeds: [
        createPlaylistStatusEmbed(
          "YouTube",
          playlistTitle,
          counts,
          counts.queued > 0 ? "complete" : "empty",
        ),
      ],
    });
  } catch (error) {
    captureException(error, {
      tags: {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        url: playlistUrl,
        action: "resolve_youtube_playlist",
      },
    });
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Failed to import YouTube playlist")
          .setDescription("Please try again later.")
          .setColor("#ff0000"),
      ],
    });
  }
}

async function handleSpotifyPlaylist(
  interaction: ChatInputCommandInteraction,
  songInput: string,
): Promise<void> {
  let playlist: SpotifyPlaylistMetadata;

  try {
    playlist = await resolveSpotifyPlaylist(songInput);
  } catch (error) {
    if (error instanceof SpotifyResolveError) {
      if (error.code === "fetch_failed" || error.code === "invalid_payload") {
        captureException(error, {
          tags: {
            guildId: interaction.guildId,
            userId: interaction.user.id,
            url: songInput,
            action: "resolve_spotify_playlist",
          },
        });
      }

      const title =
        error.code === "unsupported_type"
          ? "Unsupported Spotify link"
          : "Failed to resolve Spotify playlist";
      await interaction.editReply({
        embeds: [
          new EmbedBuilder().setTitle(title).setDescription(error.message).setColor("#ff0000"),
        ],
      });
      return;
    }

    captureException(error, {
      tags: {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        url: songInput,
        action: "resolve_spotify_playlist",
      },
    });
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Failed to resolve Spotify playlist")
          .setDescription("Please try again later.")
          .setColor("#ff0000"),
      ],
    });
    return;
  }

  const counts: PlaylistImportCounts = {
    processed: 0,
    queued: 0,
    skipped: 0,
    startedPlaying: false,
  };

  if (playlist.tracks.length === 0) {
    await interaction.editReply({
      embeds: [createPlaylistStatusEmbed("Spotify", playlist.title, counts, "empty", 0)],
    });
    return;
  }

  for (let start = 0; start < playlist.tracks.length; start += PLAYLIST_BATCH_SIZE) {
    const batch = playlist.tracks.slice(start, start + PLAYLIST_BATCH_SIZE);

    for (const track of batch) {
      counts.processed++;

      try {
        const query = buildSpotifySearchQuery(track);
        const response = await searchYouTube(interaction.guildId!, query, 0, PAGE_SIZE);
        const matchedResult = findConfidentSpotifyMatch(track, response.results);

        if (!matchedResult) {
          counts.skipped++;
          continue;
        }

        const song = buildSongPayload(interaction.user.id, matchedResult, {
          sourceUrl: track.sourceUrl || playlist.sourceUrl,
          title: track.title,
          artistText: track.artistText,
          source: SongSource.SONG_SOURCE_SPOTIFY,
        });
        const addSongResponse = await addSong(interaction.guildId!, song);

        counts.queued++;
        counts.startedPlaying ||= addSongResponse.isPlaying;
      } catch (error) {
        counts.skipped++;
        captureException(error, {
          tags: {
            guildId: interaction.guildId,
            userId: interaction.user.id,
            title: track.title,
            action: "import_spotify_playlist_track",
          },
        });
      }
    }

    await interaction.editReply({
      embeds: [
        createPlaylistStatusEmbed(
          "Spotify",
          playlist.title,
          counts,
          "progress",
          playlist.tracks.length,
        ),
      ],
    });
  }

  await interaction.editReply({
    embeds: [
      createPlaylistStatusEmbed(
        "Spotify",
        playlist.title,
        counts,
        counts.queued > 0 ? "complete" : "empty",
        playlist.tracks.length,
      ),
    ],
  });
}

async function handleSpotifyTrack(
  interaction: ChatInputCommandInteraction,
  songInput: string,
): Promise<void> {
  let track: SpotifyTrackMetadata;

  try {
    track = await resolveSpotifyTrack(songInput);
  } catch (error) {
    if (error instanceof SpotifyResolveError) {
      if (error.code === "fetch_failed" || error.code === "invalid_payload") {
        captureException(error, {
          tags: {
            guildId: interaction.guildId,
            userId: interaction.user.id,
            url: songInput,
            action: "resolve_spotify_track",
          },
        });
      }

      const title =
        error.code === "unsupported_type"
          ? "Unsupported Spotify link"
          : "Failed to resolve Spotify track";
      await interaction.editReply({
        embeds: [
          new EmbedBuilder().setTitle(title).setDescription(error.message).setColor("#ff0000"),
        ],
      });
      return;
    }

    captureException(error, {
      tags: {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        url: songInput,
        action: "resolve_spotify_track",
      },
    });
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Failed to resolve Spotify track")
          .setDescription("Please try again later.")
          .setColor("#ff0000"),
      ],
    });
    return;
  }

  try {
    const query = buildSpotifySearchQuery(track);
    const response = await searchYouTube(interaction.guildId!, query, 0, PAGE_SIZE);

    if (response.results.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("No playable match found")
            .setDescription(
              `I couldn't find a playable YouTube match for ${track.title} - ${track.artistText}.`,
            )
            .setColor("#ff0000"),
        ],
      });
      return;
    }

    const matchedResult = findConfidentSpotifyMatch(track, response.results);

    if (matchedResult) {
      const song = buildSongPayload(interaction.user.id, matchedResult, {
        sourceUrl: track.sourceUrl,
        title: track.title,
        artistText: track.artistText,
        source: SongSource.SONG_SOURCE_SPOTIFY,
      });
      const addSongResponse = await addSong(interaction.guildId!, song);

      await interaction.editReply({
        embeds: [createSuccessEmbed(addSongResponse.isPlaying, track.title, track.artistText)],
      });
      return;
    }

    const state: SearchState = {
      results: response.results,
      page: 0,
      query,
      searchLabel: `${track.title} - ${track.artistText}`,
      guildId: interaction.guildId!,
      userId: interaction.user.id,
      interaction,
      hasMore: response.hasMore,
      sessionId: `${interaction.id}-${Date.now()}`,
      selectedSongMetadata: {
        sourceUrl: track.sourceUrl,
        title: track.title,
        artistText: track.artistText,
        source: SongSource.SONG_SOURCE_SPOTIFY,
      },
    };

    await showSearchMenu(state);
  } catch (error) {
    captureException(error, {
      tags: {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        url: songInput,
        action: "search_spotify_match",
      },
    });
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Failed to match Spotify track")
          .setDescription("Please try again later.")
          .setColor("#ff0000"),
      ],
    });
  }
}

registerInteraction({
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a song or playlist")
    .addStringOption((option) =>
      option
        .setName("song")
        .setDescription("The URL of a song or playlist to play, or a search query")
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

    await interaction.deferReply();

    const youTubeInputKind = getYouTubeInputKind(songInput);

    if (youTubeInputKind === "playlist") {
      await handleYouTubePlaylist(interaction, songInput);
      return;
    }

    if (youTubeInputKind === "video") {
      try {
        const response = await addSong(interaction.guildId, {
          playbackUrl: songInput,
          requesterId: interaction.user.id,
          sourceUrl: songInput,
          source: SongSource.SONG_SOURCE_YOUTUBE,
        });
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
        await interaction.editReply("Failed to add song. Please try again later.");
      }
      return;
    }

    const spotifyInputKind = getSpotifyInputKind(songInput);

    if (spotifyInputKind === "track") {
      await handleSpotifyTrack(interaction, songInput);
      return;
    }

    if (spotifyInputKind === "playlist") {
      await handleSpotifyPlaylist(interaction, songInput);
      return;
    }

    const state: SearchState = {
      results: [],
      page: 0,
      query: songInput,
      searchLabel: songInput,
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
  },
});
