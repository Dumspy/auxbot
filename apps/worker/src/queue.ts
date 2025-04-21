interface QueueItem {
    url: string;
    requesterId: string;
}

class Queue {
    queue: QueueItem[] = [];
    playing: boolean = false;

    add(url: string, requesterId: string): void {
        this.queue.push({ url, requesterId });
    }

    pop(): QueueItem | undefined {
        return this.queue.shift();
    }

    clear(): void {
        this.queue = [];
    }
}

export const queue = new Queue();