import { Client, Events, GatewayIntentBits } from "discord.js";
import { executeCommandHandler } from "@auxbot/discord/interaction";
import * as path from "path";
import * as fs from "fs";

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

function importCommands() {
    const commandsPath = path.join(import.meta.dirname, 'commands');
    const commandsFolder = fs.readdirSync(commandsPath);

    for (const file of commandsFolder) {
        const filePath = path.join(commandsPath, file);
        import(filePath)
    }
}

export function initClient() {
    return new Promise<void>((resolve, reject) => {
        const InitializeTimeout = setTimeout(() => {
            reject(new Error("Discord client initialization timed out"));
        }, 10000); // 10 seconds timeout


        client.login(process.env.DISCORD_TOKEN).catch(reject)
        client.once(Events.ClientReady, () => {
            console.log(`Logged in as ${client.user?.tag}`);
            clearTimeout(InitializeTimeout);

            importCommands();

            resolve();
        });
    });
}

client.on(Events.InteractionCreate, executeCommandHandler)