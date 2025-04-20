import { Client, Events, GatewayIntentBits, REST, Routes } from "discord.js";
import { executeCommandHandler, getInteractions } from "@auxbot/discord/interaction";
import { env } from "./env.js";
import * as path from "path";
import * as fs from "fs";

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

async function importCommands() {
    const commandsPath = path.join(import.meta.dirname, 'commands');
    const commandsFolder = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    for (const file of commandsFolder) {
        console.log(`Importing command: ${file}`);
        const filePath = path.join(commandsPath, file);
        
        await import(filePath)
            .then(() => console.log(`Successfully imported command: ${file}`))
            .catch(err => console.error(`Error importing command ${file}:`, err));
            
    }
    
    // Wait for all imports to complete before returning
    console.log('All commands imported');
}

async function registerCommands() {
    const interactions = getInteractions();
    console.log('Registering commands:', interactions.map(interaction => interaction.data.name));
    if (interactions.length === 0) {
        console.log('No commands to register');
        return;
    }

    const commands = interactions.map(interaction => interaction.data.toJSON());
    console.log('Commands:', commands);

    const rest = new REST().setToken(env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), {
        body: commands,
    })
        .then(() => console.log('Successfully registered application commands.'))
        .catch(console.error);
}

export function getClient() {
    return client;
}

export function initClient() {
    return new Promise<void>((resolve, reject) => {
        const InitializeTimeout = setTimeout(() => {
            reject(new Error("Discord client initialization timed out"));
        }, 30000); // 30 seconds timeout


        client.login(process.env.DISCORD_TOKEN).catch(reject)
        client.once(Events.ClientReady, async () => {
            console.log(`Logged in as ${client.user?.tag}`);
            clearTimeout(InitializeTimeout);

            await importCommands(); // Wait for command imports to complete
            await registerCommands();

            resolve();
        });
    });
}

client.on(Events.InteractionCreate, executeCommandHandler)