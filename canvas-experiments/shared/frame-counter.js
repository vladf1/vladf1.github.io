export class FrameCounter {
    constructor(callback) {
        this.frames = 0;
        this.updates = 0;
        this.framesPerSecond = 0;
        this.updatesPerSecond = 0;
        this.callback = callback;
        setInterval(() => { this.tick(); }, 1000);
    }

    tick() {
        this.framesPerSecond = this.frames;
        this.updatesPerSecond = this.updates;
        this.frames = 0;
        this.updates = 0;
        if (this.callback) {
            this.callback(this.framesPerSecond, this.updatesPerSecond);
        }
    }

    frameRendered() {
        this.frames++;
    }

    updateComplete() {
        this.updates++;
    }
}
