import * as grpc from '@grpc/grpc-js';
import { 
    HealthCheckClient, 
    HealthCheckRequest, 
    HealthCheckResponse,
    HealthCheckResponse_ServingStatus 
} from '@auxbot/protos/health';


export function checkWorkerHealth(address: string, service: string = 'worker'): Promise<boolean> {
    return new Promise((resolve, reject) => {
        // Create client using the generated client class
        const client = new HealthCheckClient(
            address,
            grpc.credentials.createInsecure()
        );
        
        // Create request using the generated request type
        const request: HealthCheckRequest = { service };
        
        client.check(request, (error: Error | null, response: HealthCheckResponse) => {
            if (error) {
                console.error(`Health check failed for ${address}:`, error);
                resolve(false);
                return;
            }
            
            // Compare with the generated enum
            const isHealthy = response.status === HealthCheckResponse_ServingStatus.SERVING;
            
            console.log(`Health check for ${address}: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);
            resolve(isHealthy);
        });
    });
}