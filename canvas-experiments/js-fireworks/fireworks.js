import {
    FrameCounter,
    randomInRange,
    randomIntInRange,
} from "../shared/common.js";

var GRAVITY = 90, MIN_EXPLOSION_PARTS = 10, MAX_EXPLOSION_PARTS = 30, TIME_BETWEEN_FRAMES = 0, MIN_COLOR = 60,
    MAX_VELOCITY = 7, COLOR_RANGE = 20, MAX_COLOR = 255 - COLOR_RANGE, AIR_RESISTANCE_PER_SECOND = .95,
    sprites = [], ctx, canvasHeight, canvasWidth;

var lastAnimated = 0;
var frameCounter;

function Sprite(x, y) {
    this.x = x;
    this.y = y;
    this.created = performance.now();
}

function Bubble(x, y, r, g, b) {
    Sprite.call(this, x, y);
    this.originalX = x;
    this.originalY = y;

    this.alpha = 1;
    this.r = r;
    this.g = g;
    this.b = b;

    var speed = randomInRange(180, 300);
    var randomSpread = randomInRange(0, 1);
    var angle = randomInRange(-Math.PI + randomSpread, -randomSpread); // randomize direction:

    this.dx = speed * Math.cos(angle);
    this.dy = speed * Math.sin(angle);

    this.r += randomIntInRange(-COLOR_RANGE, COLOR_RANGE);
    this.g += randomIntInRange(-COLOR_RANGE, COLOR_RANGE);
    this.b += randomIntInRange(-COLOR_RANGE, COLOR_RANGE);

    this.toFade = randomInRange(.2, 8);
}

Bubble.prototype.drawBubble = function (oldX, oldY) {
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(" + parseInt(this.r) + "," + parseInt(this.g) + "," + parseInt(this.b) + "," + (this.alpha) + ")";
    ctx.beginPath();
    ctx.moveTo(oldX, oldY);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();
    ctx.closePath();
};

Bubble.prototype.animate = function (time) {
    var oldX = this.x, oldY = this.y;
    var secondsLived = (time - this.created) / 1000;
    var resitanceFactor = Math.pow(AIR_RESISTANCE_PER_SECOND, secondsLived);
    this.x = this.originalX + this.dx * secondsLived * (resitanceFactor);
    this.y = this.originalY + this.dy * secondsLived - (-1) * GRAVITY * (secondsLived * secondsLived) / 2;

    if (this.x < 0 || this.y > canvasHeight || this.x > canvasWidth) { // moved outside the canvas
        this.remove = true;
        return;
    }

    var secondsLeftToLive = this.toFade - secondsLived;
    this.alpha = secondsLeftToLive <= 0 ? 0 : secondsLeftToLive / this.toFade;
    if (this.alpha === 0) {
        this.remove = true;
        return;
    }
    this.drawBubble(oldX, oldY);
};

function Projectile() {
    var velocity = canvasHeight / 2.5;
    var originalX = randomInRange(canvasWidth * .4, canvasWidth * .6);
    var x = originalX;
    var y = canvasHeight;
    var angle = Math.PI / 2 + randomInRange(-.4, .4);
    var horizontalVelocity = velocity * Math.cos(angle);
    var created = performance.now();

    // setup explosion
    var msTilExplosion = randomInRange(200, 3000);
    var p = this;
    setTimeout(function () {
        p.explode();
    }, msTilExplosion);

    this.drawProjectile = function () {
        ctx.lineWidth = 10;
        ctx.lineTo(x, y);
        ctx.strokeStyle = "white";
        ctx.stroke();
        ctx.closePath();
    };

    this.explode = function () {
        var count = randomInRange(MIN_EXPLOSION_PARTS, MAX_EXPLOSION_PARTS);
        var r = randomIntInRange(MIN_COLOR, MAX_COLOR);
        var g = randomIntInRange(MIN_COLOR, MAX_COLOR);
        var b = randomIntInRange(MIN_COLOR, MAX_COLOR);
        for (var i = 0; i < count; i++) {
            sprites.push(new Bubble(x, y, r, g, b));
        }
        this.remove = true;
    };

    this.animate = function (time) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        var secondsPassed = (time - created) / 1000;
        var reversedY = velocity * secondsPassed - GRAVITY * (secondsPassed * secondsPassed) / 2;
        x = originalX + horizontalVelocity * secondsPassed; // todo: add air resistance
        y = canvasHeight - reversedY;
        this.drawProjectile();
    };
}

function renderFrame(now) {
    var timeBetweenFrames = now - lastAnimated;
    ctx.fillStyle = "rgba(0,0,0, " + .006 * timeBetweenFrames + ")";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight); // erase the canvas		
    lastAnimated = now;

    ctx.lineCap = "round";

    var replacedSprites = [];
    for (var i = 0; i < sprites.length; i++) {
        var sprite = sprites[i];
        sprite.animate(now);
        if (!sprite.remove) {
            replacedSprites.push(sprite);
        }
    }
    sprites = replacedSprites;
    frameCounter.frameRendered();

    requestAnimationFrame(renderFrame);
}

window.onload = function () {
    var canvas = document.getElementById("c");
    if (!canvas.getContext) {
        return;
    }
    ctx = canvas.getContext("2d");

    window.onresize = function () {
        canvasWidth = canvas.width = Math.min(1000, document.documentElement.clientWidth);
        canvasHeight = canvas.height = document.documentElement.clientHeight;
    };
    window.onresize();

    function launchProjectile() {
        sprites.push(new Projectile());
        // return false;
    };

    document.onkeydown = document.ontouchstart = document.onmousedown = launchProjectile;

    document.ontouchmove = function (event) {
        // Tell Safari not to move the window.
        event.preventDefault();
    };

    (function randomFire() {
        launchProjectile();
        setTimeout(randomFire, randomInRange(500, 2000));
    })();

    var statusBarElement = document.getElementById("statusBar");
    frameCounter = new FrameCounter(function (frames) {
        statusBarElement.innerHTML = frames + " fps, " + sprites.length + " sprites, " + canvasWidth + "x" + canvasHeight;
    });

    requestAnimationFrame(renderFrame);
};
