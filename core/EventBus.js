class EventBus {
    constructor() {
        this.topics = {};
        this.subscribers = {};
        this.tickCounter = 0;
    }

    beginTick() {
        this.tickCounter = 0;
        for (const topic in this.topics) {
            this.topics[topic] = this.topics[topic].filter((event) => {
                return !event.handled && event.expireAt >= Game.time;
            });
        }
    }

    publish(topic, priority, data, expireIn = 1) {
        if (!this.topics[topic]) this.topics[topic] = [];

        const event = {
            id: `${topic}_${Game.time}_${this.tickCounter++}`,
            topic,
            priority,
            data,
            expireAt: Game.time + expireIn,
            handled: false
        };

        this.topics[topic].push(event);
        return event.id;
    }

    subscribe(topic, callback) {
        if (!this.subscribers[topic]) this.subscribers[topic] = [];
        if (this.subscribers[topic].indexOf(callback) === -1) {
            this.subscribers[topic].push(callback);
        }
    }

    dispatch() {
        for (const topic in this.topics) {
            const callbacks = this.subscribers[topic] || [];
            if (callbacks.length === 0) continue;

            const events = this.topics[topic]
                .filter((event) => !event.handled && event.expireAt >= Game.time)
                .sort((a, b) => b.priority - a.priority);

            for (const event of events) {
                for (const callback of callbacks) {
                    try {
                        if (callback(event)) {
                            event.handled = true;
                            break;
                        }
                    } catch (error) {
                        console.log(`[EventBus] ${topic} dispatch failed: ${error.stack || error}`);
                    }
                }
            }

            this.topics[topic] = events.filter((event) => !event.handled);
        }
    }

    clearSubscribers() {
        this.subscribers = {};
    }
}

if (!global.EventBusInstance) {
    global.EventBusInstance = new EventBus();
}

module.exports = global.EventBusInstance;
