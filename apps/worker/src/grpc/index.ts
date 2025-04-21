import * as grpc from '@grpc/grpc-js';
import { env } from '../env.js';
import { HealthCheckRequest, HealthCheckResponse, HealthCheckService, HealthCheckResponse_ServingStatus } from '@auxbot/protos/health';

const server = new grpc.Server();

export function registerService<T extends grpc.ServiceDefinition, S extends grpc.UntypedServiceImplementation>(
    service: T,
    implementation: S
) {
    server.addService(service, implementation);
}

async function loadServices() {
    await import('./services/player.js');
}

export async function initGrpc() {
    await loadServices();

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