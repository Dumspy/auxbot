import { env } from './env.js';
import { entersState, joinVoiceChannel, VoiceConnectionStatus } from '@discordjs/voice';
import { initClient, getClient } from './discord.js';
import { getPlayer } from './player.js';
import * as grpc from '@grpc/grpc-js';
import { 
  HealthCheckService, 
  HealthCheckRequest, 
  HealthCheckResponse,
  HealthCheckResponse_ServingStatus,
  HealthCheckServer
} from '@auxbot/protos/health';

const client = getClient();

// Initialize gRPC server
function initGrpcServer() {
    const server = new grpc.Server();
    
    // Implement the health check service using ts-proto generated types
    server.addService(HealthCheckService, {
        check: (
            call: grpc.ServerUnaryCall<HealthCheckRequest, HealthCheckResponse>,
            callback: grpc.sendUnaryData<HealthCheckResponse>
        ) => {
            console.log(`Health check requested for service: ${call.request.service}`);
            // Return SERVING status using the generated enum
            callback(null, { 
                status: HealthCheckResponse_ServingStatus.SERVING 
            });
        }
    });

    
    // Start the server using the port from environment variables
    const port = env.GRPC_PORT;
    server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) {
            console.error('Failed to start gRPC server:', err);
            return;
        }
        console.log(`gRPC server started on port ${port}`);
    });
}

client.once('ready', async () => {
    console.log('Worker is ready');
    
    try {
        const guild = client.guilds.cache.get(env.DISCORD_GUILD_ID);
        if (!guild) {
            console.error(`Guild ${env.DISCORD_GUILD_ID} not found!`);
            return;
        }
        
        const channelId = env.DISCORD_CHANNEL_ID;
        console.log(`Attempting to join voice channel: ${channelId} in guild: ${guild.name}`);
        
        const connection = joinVoiceChannel({
            channelId: channelId,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
        });

        const player = getPlayer()
        connection.subscribe(player);

        await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    } catch (error) {
        console.error('Error joining voice channel:', error);
    }
});

async function boot(){
    await initClient();
    console.log('Discord client initialized');
    
    // Initialize gRPC server
    initGrpcServer();
    console.log('gRPC health check server initialized');
}

boot()