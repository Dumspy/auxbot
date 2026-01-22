import { env } from "./env.js";
import {
  entersState,
  joinVoiceChannel,
  VoiceConnectionStatus,
  VoiceConnection,
} from "@discordjs/voice";
import { initClient, getClient } from "./discord.js";
import { player } from "./player.js";
import { initGrpc } from "./grpc/index.js";
import { initSentry, captureException } from "@auxbot/sentry";
import { Events } from "discord.js";

const client = getClient();
let voiceConnection: VoiceConnection | null = null;

async function boot() {
  try {
    initSentry({
      serverName: "worker",
    });

    await initClient();
    console.log("Discord client initialized");

    await initGrpc();
    console.log("gRPC health check server initialized");
  } catch (error) {
    captureException(error, {
      tags: {
        function: "boot",
      },
    });
  }
}

client.once(Events.ClientReady, async () => {
  console.log("Worker is ready");

  try {
    const guild = client.guilds.cache.get(env.DISCORD_GUILD_ID);
    if (!guild) {
      captureException(new Error(`Guild ${env.DISCORD_GUILD_ID} not found!`), {
        tags: {
          function: "client.once ready",
        },
      });
      return;
    }

    const channelId = env.DISCORD_CHANNEL_ID;
    console.log(`Attempting to join voice channel: ${channelId} in guild: ${guild.name}`);

    voiceConnection = joinVoiceChannel({
      channelId: channelId,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
    });

    try {
      // Increase timeout to 60 seconds for kubernetes environment
      await entersState(voiceConnection, VoiceConnectionStatus.Ready, 60_000);
      voiceConnection.subscribe(player.getRawPlayer());
      console.log("Successfully joined voice channel!");
    } catch (error) {
      console.error("Failed to establish voice connection:", error);
      // Attempt to destroy the connection if it failed
      voiceConnection.destroy();
      voiceConnection = null;
      throw error;
    }

    // Set up connection state change listener
    voiceConnection.on("stateChange", (oldState, newState) => {
      console.log(`Voice connection state changed from ${oldState.status} to ${newState.status}`);
      if (newState.status === VoiceConnectionStatus.Disconnected) {
        // Handle disconnection and attempt to reconnect
        try {
          voiceConnection?.rejoin();
        } catch (error) {
          console.error("Failed to rejoin voice channel:", error);
          voiceConnection?.destroy();
          voiceConnection = null;
        }
      }
    });
  } catch (error) {
    console.error("Error during voice channel connection:", error);

    captureException(error, {
      tags: {
        function: "client.once ready",
      },
    });
  }
});

export function getVoiceConnection() {
  return voiceConnection;
}

boot();
