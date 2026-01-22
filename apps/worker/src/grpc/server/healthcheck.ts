import {
  HealthCheckRequest,
  HealthCheckResponse,
  HealthCheckResponse_ServingStatus,
  HealthCheckServer,
  HealthCheckService,
} from "@auxbot/protos/health";
import { registerService } from "../index.js";
import { ServerUnaryCall, sendUnaryData } from "@grpc/grpc-js";

registerService<HealthCheckService, HealthCheckServer>(HealthCheckService, {
  check: function (
    call: ServerUnaryCall<HealthCheckRequest, HealthCheckResponse>,
    callback: sendUnaryData<HealthCheckResponse>,
  ): void {
    console.log(`Health check requested for service: ${call.request.service}`);
    // Return SERVING status using the generated enum
    callback(null, {
      status: HealthCheckResponse_ServingStatus.SERVING,
    });
  },
});
