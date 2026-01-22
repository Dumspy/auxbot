import { Client, Events, GatewayIntentBits } from "discord.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

export function getClient() {
  return client;
}

export function initClient() {
  return new Promise<void>((resolve, reject) => {
    const InitializeTimeout = setTimeout(() => {
      reject(new Error("Discord client initialization timed out"));
    }, 30000); // 30 seconds timeout

    client.login(process.env.DISCORD_TOKEN).catch(reject);
    client.once(Events.ClientReady, async () => {
      console.log(`Logged in as ${client.user?.tag}`);
      clearTimeout(InitializeTimeout);

      resolve();
    });
  });
}
