interface QueueItem {
    url: string;
}

interface Queue {
    add: (url: string) => void;
    pop: () => QueueItem | undefined;
    clear: () => void;
    queue: QueueItem[];
    playing: boolean;
}

const queueState: Queue = {
    queue: [],
    playing: false,
    add: function (url: string): void {
        this.queue.push({ url });
    },
    pop: function (): QueueItem | undefined {
        return this.queue.shift();
    },
    clear: function (): void {
        this.queue = [];
    }
};

export function getQueue(): Queue {
    return queueState;
}