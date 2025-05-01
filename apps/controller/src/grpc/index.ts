import * as grpc from '@grpc/grpc-js';
import { env } from '../env.js';

const server = new grpc.Server();

export function registerService<T extends grpc.ServiceDefinition, S extends grpc.UntypedServiceImplementation>(
    service: T,
    implementation: S
) {
    server.addService(service, implementation);
}

async function loadServices() {
    await import('./server/worker_lifecycle.js');
}

export async function initGrpc() {
    await loadServices();

    const port = env.WORKER_GRPC_PORT;
    server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) {
            console.error('Failed to start gRPC server:', err);
            return;
        }
        console.log(`gRPC server started on port ${port}`);
    });
}