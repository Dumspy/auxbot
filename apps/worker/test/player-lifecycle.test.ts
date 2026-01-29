import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AudioPlayer, VoiceConnection } from '@discordjs/voice';

const mockClient = vi.hoisted(() => ({
  login: vi.fn().mockResolvedValue(null),
  destroy: vi.fn(),
  once: vi.fn(),
  on: vi.fn(),
}));

vi.mock('../src/discord.js', () => ({
  getClient: vi.fn(() => mockClient),
  boot: vi.fn(),
  initClient: vi.fn(),
}));

vi.mock('../src/grpc/client/worker_lifecycle.js', () => ({
  notifyShutdown: vi.fn().mockResolvedValue(undefined),
}));

import { createPlayer, setDefaultDeps, resetDefaultDeps } from '../src/player.js';
import { queue } from '../src/queue.js';

describe('Player lifecycle', () => {
  let mockAudioPlayer: AudioPlayer;
  let mockVoiceConnection: VoiceConnection;
  let mockDeps: any;

  beforeEach(() => {
    vi.useFakeTimers();
    queue.clear();

    mockAudioPlayer = {
      play: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      unpause: vi.fn(),
      on: vi.fn(),
      state: { status: 'idle' },
    } as any;

    mockVoiceConnection = {
      destroy: vi.fn(),
    } as any;

    mockDeps = {
      createAudioPlayer: () => mockAudioPlayer,
      getVoiceConnection: () => mockVoiceConnection,
      spawn: vi.fn(),
      processExit: vi.fn(),
    };

    setDefaultDeps(mockDeps);
  });

  afterEach(() => {
    vi.useRealTimers();
    resetDefaultDeps();
    vi.clearAllMocks();
    queue.clear();
  });

  it('should create player with injected dependencies', () => {
    const player = createPlayer();
    expect(player.getRawPlayer()).toBe(mockAudioPlayer);
  });

  it('should skip song when playing', () => {
    queue.playing = true;
    const player = createPlayer();
    const result = player.skipSong();

    expect(result.success).toBe(true);
    expect(mockAudioPlayer.stop).toHaveBeenCalled();
  });

  it('should pause and resume playback', () => {
    (mockAudioPlayer.state as any).status = 'playing';
    const player = createPlayer();

    const paused = player.pausePlayback();
    expect(paused).toBe(true);
    expect(mockAudioPlayer.pause).toHaveBeenCalled();

    (mockAudioPlayer.state as any).status = 'paused';
    const resumed = player.resumePlayback();
    expect(resumed).toBe(true);
    expect(mockAudioPlayer.unpause).toHaveBeenCalled();
  });

  it('should disconnect voice connection on shutdown', async () => {
    (mockAudioPlayer.state as any).status = 'idle';
    process.env.INACTIVITY_TIMEOUT_MINUTES = '0.1';
    const player = createPlayer();

    vi.advanceTimersByTime(10 * 1000);
    await vi.runOnlyPendingTimersAsync();
    vi.advanceTimersByTime(1000);
    await vi.runOnlyPendingTimersAsync();

    expect(mockVoiceConnection.destroy).toHaveBeenCalled();
    expect(mockDeps.processExit).toHaveBeenCalledWith(0);
  });

  it('should use fake timers for inactivity check and exit', async () => {
    (mockAudioPlayer.state as any).status = 'idle';
    process.env.INACTIVITY_TIMEOUT_MINUTES = '0.1';
    const player = createPlayer();

    vi.advanceTimersByTime(10 * 1000);
    await vi.runOnlyPendingTimersAsync();
    vi.advanceTimersByTime(1000);
    await vi.runOnlyPendingTimersAsync();

    expect(mockVoiceConnection.destroy).toHaveBeenCalled();
    expect(mockDeps.processExit).toHaveBeenCalledWith(0);
  });

  it('should use fake timers for inactivity check and exit', async () => {
    (mockAudioPlayer.state as any).status = 'idle';
    process.env.INACTIVITY_TIMEOUT_MINUTES = '0.1';
    const player = createPlayer();

    vi.advanceTimersByTime(10 * 1000);
    await vi.runOnlyPendingTimersAsync();
    vi.advanceTimersByTime(1000);
    await vi.runOnlyPendingTimersAsync();

    expect(mockVoiceConnection.destroy).toHaveBeenCalled();
    expect(mockDeps.processExit).toHaveBeenCalledWith(0);
  });

  it('should use fake timers for inactivity check and exit', async () => {
    (mockAudioPlayer.state as any).status = 'idle';
    process.env.INACTIVITY_TIMEOUT_MINUTES = '0.1';
    const player = createPlayer();

    vi.advanceTimersByTime(10 * 1000);
    await vi.runOnlyPendingTimersAsync();
    vi.advanceTimersByTime(1000);
    await vi.runOnlyPendingTimersAsync();

    expect(mockVoiceConnection.destroy).toHaveBeenCalled();
    expect(mockDeps.processExit).toHaveBeenCalledWith(0);
  });
});
