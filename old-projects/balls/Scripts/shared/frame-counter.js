var FrameCounter = (function () {
    function FrameCounter(callback) {
        var _this = this;
        this.frames = 0;
        this.updates = 0;
        this.framesPerSecond = 0;
        this.updatesPerSecond = 0;
        this.callback = callback;
        setInterval(function () { _this.tick(); }, 1000);
    }
    FrameCounter.prototype.tick = function () {
        this.framesPerSecond = this.frames;
        this.updatesPerSecond = this.updates;
        this.frames = 0;
        this.updates = 0;
        if (this.callback) {
            this.callback(this.framesPerSecond, this.updatesPerSecond);
        }
    };
    FrameCounter.prototype.frameRendered = function () {
        this.frames++;
    };
    FrameCounter.prototype.updateComplete = function () {
        this.updates++;
    };
    return FrameCounter;
})();
//# sourceMappingURL=frame-counter.js.map