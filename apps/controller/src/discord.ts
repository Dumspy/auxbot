import { Client, Events, GatewayIntentBits, REST, Routes } from "discord.js";
import { executeCommandHandler, getInteractions } from "@auxbot/discord/interaction";
import { env } from "./env.js";
import * as path from "path";
import * as fs from "fs";

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

function importCommands() {
    const commandsPath = path.join(import.meta.dirname, 'commands');
    const commandsFolder = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandsFolder) {
        const filePath = path.join(commandsPath, file);
        import(filePath)
    }
}

function registerCommands() {
    const interactions = getInteractions();
    const commands = interactions.map(interaction => interaction.data.toJSON());

    const rest = new REST().setToken(env.DISCORD_TOKEN);
    rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), {
        body: commands,
    })
        .then(() => console.log('Successfully registered application commands.'))
        .catch(console.error);
}

export function initClient() {
    return new Promise<void>((resolve, reject) => {
        const InitializeTimeout = setTimeout(() => {
            reject(new Error("Discord client initialization timed out"));
        }, 30000); // 30 seconds timeout


        client.login(process.env.DISCORD_TOKEN).catch(reject)
        client.once(Events.ClientReady, () => {
            console.log(`Logged in as ${client.user?.tag}`);
            clearTimeout(InitializeTimeout);

            importCommands();
            registerCommands();

            resolve();
        });
    });
}

client.on(Events.InteractionCreate, executeCommandHandler)