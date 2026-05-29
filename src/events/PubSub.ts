export default class PubSub {
    events: Record<string, Array<(e: object) => null>>;

    constructor() { this.events = {}  }
    
    subscribe(event: string, callback: (e: object) => null) {
        if (!this.events.hasOwnProperty(event)) {
            this.events[event] = []
        }
        return this.events[event].push(callback)
    }
    
}