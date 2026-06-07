export const TWO_PI = Math.PI * 2;

export function normalizeAngle(angle) {
    if (angle < 0 || angle > TWO_PI) {
        var normalAngle = Math.abs(TWO_PI - Math.abs(angle));
        return normalAngle;
    }
    return angle;
}

// This function takes an angle in the range [-3*pi, 3*pi] and
// wraps it to the range [-pi, pi].
export function fixAngle(angle)
{
    if (angle > Math.PI)
        return angle - TWO_PI;
    else if (angle < -Math.PI)
        return angle + TWO_PI;
    else
        return angle;
}

export function removeByValue(arr, val) {
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] == val) {
            arr.splice(i, 1);
            break;
        }
    }
}

export function removeAll(from, removed) {
    for (var i = 0; i < removed.length; i++) {
        removeByValue(from, removed[i]);
    }
}

export function clearScreen(ctx) {
    ctx.fillStyle = "rgba(0,0,0, .1)";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); // erase the canvas
}

export function randomInRange(minVal, maxVal) {
    return minVal + (Math.random() * (maxVal - minVal));
}

export function randomIntInRange(minVal, maxVal) {
    return parseInt(randomInRange(minVal, maxVal));
}

export function randomNonZeroIntInRange(minVal, maxVal) {
    var c;
    do {
        c = parseInt(randomInRange(minVal, maxVal));
    }
    while (c == 0)
    return c;
}

export function calcDistance(x1, y1, x2, y2) {
    var sum = Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2);
    return Math.sqrt(sum);
}

export function isOutsideDistance(x1, y1, x2, y2, dist) {
    var xdif = Math.abs(x1 - x2);
    if (dist <= xdif)
        return true;

    var ydif = Math.abs(y1 - y2);
    if (dist <= ydif)
        return true;


    var sum = Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2);
    var sqrDist = Math.pow(dist, 2);
    return sqrDist <= sum;
}


export function difBetweenAngles(a1, a2) {
    var dif = a1 - a2;
    if (dif > Math.PI) {
        return Math.PI - dif;
    }
    if (dif < -Math.PI) {
        return -Math.PI - dif;
    }
    //console.log("difference between angels: " + dif);

    return dif;
}

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

export const CanvasFpsCounter =
{
    additionalInfoCallback: null,

    frames: 0,
    fps: 0,

    tick: function () {
        CanvasFpsCounter.fps = CanvasFpsCounter.frames;
        CanvasFpsCounter.frames = 0;
    },

    startTimer: function () {
        setInterval(CanvasFpsCounter.tick, 1000);
    },

    showFps: function (ctx) {
        CanvasFpsCounter.frames++;

        if (this.fps != 0 && ctx.fillText) {
            ctx.save();
            ctx.textBaseline = "top";
            ctx.font = "12pt Arial";
            ctx.fillStyle = "white";
            var str = CanvasFpsCounter.fps;
            if (CanvasFpsCounter.additionalInfoCallback) {
                str = str + " " + CanvasFpsCounter.additionalInfoCallback();
            }
            ctx.fillText(str, 5, 5);
            ctx.restore();
        }
    }
};
