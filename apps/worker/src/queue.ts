import { SongSource } from "@auxbot/protos/player";

export interface QueueItem {
  url: string;
  playbackUrl: string;
  title: string;
  artistText: string;
  source: SongSource;
  requesterId: string;
}

class Queue {
  queue: QueueItem[] = [];
  playing: boolean = false;

  add(item: QueueItem): number {
    const queuePosition = this.queue.length;

    this.queue.push(item);

    return queuePosition;
  }

  pop(): QueueItem | undefined {
    return this.queue.shift();
  }

  clear(): void {
    this.queue = [];
  }
}

export const queue = new Queue();
