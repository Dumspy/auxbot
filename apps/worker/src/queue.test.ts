import { describe, it, expect, beforeEach } from 'vitest';
import { queue } from './queue.js';

describe('Queue', () => {
  beforeEach(() => {
    queue.clear();
  });

  it('should add items to queue', () => {
    const position = queue.add('https://example.com/song1', 'user1');
    expect(position).toBe(0);
    expect(queue.queue).toHaveLength(1);
    expect(queue.queue[0]?.url).toBe('https://example.com/song1');
    expect(queue.queue[0]?.requesterId).toBe('user1');
  });

  it('should return correct position for multiple items', () => {
    queue.add('https://example.com/song1', 'user1');
    const position = queue.add('https://example.com/song2', 'user2');
    expect(position).toBe(1);
    expect(queue.queue).toHaveLength(2);
  });

  it('should pop items from queue', () => {
    queue.add('https://example.com/song1', 'user1');
    queue.add('https://example.com/song2', 'user2');

    const firstItem = queue.pop();
    expect(firstItem?.url).toBe('https://example.com/song1');
    expect(firstItem?.requesterId).toBe('user1');
    expect(queue.queue).toHaveLength(1);

    const secondItem = queue.pop();
    expect(secondItem?.url).toBe('https://example.com/song2');
    expect(secondItem?.requesterId).toBe('user2');
    expect(queue.queue).toHaveLength(0);
  });

  it('should return undefined when popping empty queue', () => {
    const item = queue.pop();
    expect(item).toBeUndefined();
  });

  it('should clear queue', () => {
    queue.add('https://example.com/song1', 'user1');
    queue.add('https://example.com/song2', 'user2');
    queue.add('https://example.com/song3', 'user3');

    expect(queue.queue).toHaveLength(3);
    queue.clear();
    expect(queue.queue).toHaveLength(0);
  });
});
