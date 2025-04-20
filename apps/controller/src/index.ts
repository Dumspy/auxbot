import express from 'express';
import * as k8s from '@kubernetes/client-node';
import { Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Initialize Kubernetes client
const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(k8s.BatchV1Api);

// Initialize Discord client
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

// Register the join command
const commands = [
    new SlashCommandBuilder()
        .setName('join')
        .setDescription('Join a voice channel')
        .addChannelOption(option => 
            option.setName('channel')
                .setDescription('The voice channel to join')
                .setRequired(true)
        ).toJSON()
];

client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user?.tag}`);
    
    // Register commands
    try {
        const rest = new REST().setToken(process.env.DISCORD_TOKEN || '');
        await rest.put(
            Routes.applicationCommands(process.env.DISCORD_CLIENT_ID || ''),
            { body: commands }
        );
        console.log('Successfully registered application commands');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

// Handle join command
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'join') {
        await interaction.deferReply();
        
        try {
            const channel = interaction.options.getChannel('channel');
            if (!channel) {
                await interaction.editReply('You need to specify a valid voice channel!');
                return;
            }
            
            const guildId = interaction.guildId;
            if (!guildId) {
                await interaction.editReply('This command can only be used in a server!');
                return;
            }
            
            // Spawn worker pod with guild and channel info
            const jobName = await spawnWorkerPod(guildId, channel.id);
            
            await interaction.editReply(`Joining voice channel! Worker pod "${jobName}" spawned.`);
        } catch (error: any) {
            console.error('Error handling join command:', error);
            await interaction.editReply('Failed to join the channel: ' + (error.message || 'Unknown error'));
        }
    }
});

// Login to Discord (if token is provided)
if (process.env.DISCORD_TOKEN) {
    client.login(process.env.DISCORD_TOKEN).catch(error => {
        console.error('Failed to login to Discord:', error);
    });
} else {
    console.warn('DISCORD_TOKEN not provided, Discord bot functionality will be disabled');
}

// Function to spawn a worker pod with guild and channel info
async function spawnWorkerPod(guildId: string, channelId: string): Promise<string> {
    const namespace = process.env.K8S_NAMESPACE || 'default';
    const jobName = `auxbot-worker-${Date.now()}`;

    const jobBody: k8s.V1Job = {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
            name: jobName,
            labels: {
                app: 'auxbot-worker',
            },
        },
        spec: {
            template: {
                metadata: {
                    labels: {
                        app: 'auxbot-worker',
                    },
                },
                spec: {
                    containers: [{
                        name: 'worker',
                        image: process.env.WORKER_IMAGE || 'ghcr.io/dumspy/auxbot-worker:latest',
                        imagePullPolicy: 'Always',
                        env: [
                            {
                                name: 'DISCORD_TOKEN',
                                value: process.env.DISCORD_TOKEN
                            },
                            {
                                name: 'DISCORD_CLIENT_ID',
                                value: process.env.DISCORD_CLIENT_ID
                            },
                            {
                                name: 'DISCORD_GUILD_ID',
                                value: guildId
                            },
                            {
                                name: 'DISCORD_CHANNEL_ID',
                                value: channelId
                            }
                        ]
                    }],
                    restartPolicy: 'Never'
                }
            },
            ttlSecondsAfterFinished: 100
        }
    }

    await k8sApi.createNamespacedJob({
        namespace,
        body: jobBody
    });

    console.log(`Worker job created: ${jobName} for guild: ${guildId}, channel: ${channelId}`);

    return jobName;
}

app.get('/', (req, res) => {
    res.json({ message: 'Auxbot Controller API is running' });
});

app.listen(port, () => {
    console.log(`Controller service listening on port ${port}`);
});