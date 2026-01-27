import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPlayer, setDefaultDeps, resetDefaultDeps, type PlayerDeps } from '../src/player.js';
import type { AudioPlayer, VoiceConnection } from '@discordjs/voice';

describe('Player lifecycle', () => {
  let mockAudioPlayer: AudioPlayer;
  let mockVoiceConnection: VoiceConnection;
  let mockDeps: PlayerDeps;

  beforeEach(() => {
    vi.useFakeTimers();

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
  });

  it('should create player with injected dependencies', () => {
    const player = createPlayer();
    expect(player.getRawPlayer()).toBe(mockAudioPlayer);
  });

  it('should skip song when playing', () => {
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

  it('should use fake timers for inactivity check', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z').getTime());
    const player = createPlayer();

    (mockAudioPlayer.state as any).status = 'idle';

    vi.advanceTimersByTime(5 * 60 * 1000);

    expect(mockDeps.processExit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60 * 1000);

    expect(mockDeps.processExit).toHaveBeenCalledWith(0);
  });

  it('should disconnect voice connection on shutdown', () => {
    const player = createPlayer();
    vi.advanceTimersByTime(6 * 60 * 1000);

    expect(mockVoiceConnection.destroy).toHaveBeenCalled();
  });
});
