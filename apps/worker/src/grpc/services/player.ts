import * as grpc from '@grpc/grpc-js';
import { 
    AddSongRequest,
    AddSongResponse,
    ClearQueueRequest,
    ClearQueueResponse,
    PauseRequest,
    PauseResponse,
    PlayerServer,
    PlayerService,
    PlayerStatusRequest,
    PlayerStatusResponse,
    QueueStatusRequest,
    QueueStatusResponse,
    ResumeRequest,
    ResumeResponse,
    SkipRequest,
    SkipResponse
} from '@auxbot/protos/player';
import { registerService } from "../index.js";
import { queue } from '../../queue.js';
import { playNext } from '../../player.js';

registerService<PlayerService, PlayerServer>(
    PlayerService,
    {
        addSong: function (call: grpc.ServerUnaryCall<AddSongRequest, AddSongResponse>, callback: grpc.sendUnaryData<AddSongResponse>): void {
            const { url, requesterId } = call.request;

            queue.add(url, requesterId);
            if (!queue.playing) {
                playNext();
            }

            callback(null, {
                success: true,
                message: '',
                isPlaying: false,
                position: 0
            });
        },
        skipSong: function (call: grpc.ServerUnaryCall<SkipRequest, SkipResponse>, callback: grpc.sendUnaryData<SkipResponse>): void {
            throw new Error("Function not implemented.");
        },
        clearQueue: function (call: grpc.ServerUnaryCall<ClearQueueRequest, ClearQueueResponse>, callback: grpc.sendUnaryData<ClearQueueResponse>): void {
            throw new Error("Function not implemented.");
        },
        getQueueStatus: function (call: grpc.ServerUnaryCall<QueueStatusRequest, QueueStatusResponse>, callback: grpc.sendUnaryData<QueueStatusResponse>): void {
            throw new Error("Function not implemented.");
        },
        pausePlayback: function (call: grpc.ServerUnaryCall<PauseRequest, PauseResponse>, callback: grpc.sendUnaryData<PauseResponse>): void {
            throw new Error("Function not implemented.");
        },
        resumePlayback: function (call: grpc.ServerUnaryCall<ResumeRequest, ResumeResponse>, callback: grpc.sendUnaryData<ResumeResponse>): void {
            throw new Error("Function not implemented.");
        },
        getPlayerStatus: function (call: grpc.ServerUnaryCall<PlayerStatusRequest, PlayerStatusResponse>, callback: grpc.sendUnaryData<PlayerStatusResponse>): void {
            throw new Error("Function not implemented.");
        }
    }
);