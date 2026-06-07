import {
    FrameCounter,
    TWO_PI,
    randomInRange,
} from "../shared/common.js";

/*
Shot them up game
Inspired by http://www.roblox.com/Shoot-em-down-Particle-effects-thing-place?id=133089599
*/
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var config = {
    motionBlur: false,
    shakingWhenShipsAreHit: false,
    enableEpilepsy: false,
    enableParticles: true
};
var twoPi = TWO_PI;
var sprites = new Array();
var shotsFired = 0;
var shipsKilled = 0;
var shipHeight = 40;
var spaceBetweenShips = 15;
var projectileVelocity = 700;
var nextFrameWhite = false;
var numberOfProjectilesLaunchedWhenShipsExplode = 3;
var angleBetweenProjectilesCreatedByExplodingShips = twoPi / numberOfProjectilesLaunchedWhenShipsExplode;
var canvas = document.getElementById("gameCanvas");
var context = canvas.getContext("2d");
var canvasHeight = canvas.height;
var canvasWidth = canvas.width;
var framesPerSecondSpan = $("#framesPerSecond");
var updatesPerSecondSpan = $("#updatesPerSecond");
var spritesTrackedSpan = $("#spritesTracked");
var shotsFiredSpan = $("#bulletsFired");
var shipsKilledSpan = $("#shipsKilled");
var shipHitAnimationDurationInSeconds = 2.5;
var frameCounter = new FrameCounter(function (frames, updates) {
    framesPerSecondSpan.text(frames);
    updatesPerSecondSpan.text(updates);
});
var isShaking = false;
var lastTimeFrameWasRendered;
var nowOffset = Date.now(); // in case performance.now is not supported
var getNow = window.performance && window.performance.now ? function () { return window.performance.now(); } : function () { return Date.now() - nowOffset; };
((function ($) {
    $.fn.shake = function (options) {
        // defaults
        var settings = {
            shakes: 4,
            distance: 5,
            duration: 100,
            callback: null
        };
        // merge options
        if (options) {
            $.extend(settings, options);
        }
        // make it so
        if (settings.callback) {
            setTimeout(settings.callback, settings.duration);
        }
        var pos;
        return this.each(function () {
            var $this = $(this);
            // position if necessary
            pos = $this.css("position");
            if (!pos || pos === "static") {
                $this.css("position", "relative");
            }
            // shake it
            for (var x = 1; x <= settings.shakes; x++) {
                $this.animate({ left: settings.distance * -1 }, (settings.duration / settings.shakes) / 4)
                    .animate({ left: settings.distance }, (settings.duration / settings.shakes) / 2)
                    .animate({ left: 0 }, (settings.duration / settings.shakes) / 4);
            }
        });
    };
})(jQuery));
// t: current time, b: begInnIng value, c: change In value, d: duration
var easeOutCubic = function (x, t, b, c, d) { return (c * ((t = t / d - 1) * t * t + 1) + b); };
var Sprite = (function () {
    function Sprite(x, y, angle, width, height, alpha, color, velocity) {
        this.originalX = this.x = x;
        this.originalY = this.y = y;
        this.angle = angle;
        this.width = width;
        this.height = height;
        this.halfWidth = width / 2;
        this.halfHeight = height / 2;
        this.originalAlpha = this.alpha = alpha || 1;
        this.color = color;
        this.velocity = velocity;
    }
    Sprite.prototype.draw = function () {
        context.save();
        context.beginPath();
        context.translate(this.x, this.y);
        context.rotate(this.angle);
        context.rect(-this.halfWidth, -this.halfHeight, this.width, this.height);
        context.globalAlpha = this.alpha;
        context.fillStyle = this.color;
        context.fill();
        context.restore();
    };
    Sprite.prototype.animate = function (time) {
    };
    return Sprite;
})();
var Projectile = (function (_super) {
    __extends(Projectile, _super);
    function Projectile(originalX, originalY, angle, color) {
        _super.call(this, originalX, originalY, angle, 10, 10, 1, color, projectileVelocity);
        this.horizontalVelocity = this.velocity * Math.cos(angle);
        this.verticalVelocity = this.velocity * Math.sin(angle);
        this.created = getNow();
    }
    Projectile.prototype.animate = function (time) {
        var secondsPassed = (time - this.created) / 1000;
        this.x = this.originalX - this.horizontalVelocity * secondsPassed;
        this.y = this.originalY - this.verticalVelocity * secondsPassed;
        if (config.enableParticles && Math.random() < .2) {
            createParticles(this.x, this.y, time, 10, 40, 1, 1, this.color, 3, 7);
        }
    };
    return Projectile;
})(Sprite);
var Particle = (function (_super) {
    __extends(Particle, _super);
    function Particle(originalX, originalY, velocity, minSize, maxSize, color, now) {
        var angle = randomInRange(0, twoPi);
        var particleSize = randomInRange(minSize, maxSize);
        _super.call(this, originalX, originalY, angle, particleSize, particleSize, .8, color, velocity);
        this.created = now;
        this.originalAngle = this.angle;
        this.horizontalVelocity = this.velocity * Math.cos(this.angle);
        this.verticalVelocity = this.velocity * Math.sin(this.angle);
        this.timeToLive = randomInRange(300, 1100);
    }
    Particle.prototype.animate = function (now) {
        var millisecondsPassed = now - this.created;
        var secondsPassed = millisecondsPassed / 1000;
        if (millisecondsPassed > this.timeToLive) {
            this.remove = true;
        }
        this.alpha = (1 - (millisecondsPassed / this.timeToLive)) * this.originalAlpha;
        this.x = this.originalX + this.horizontalVelocity * secondsPassed;
        this.y = this.originalY + this.verticalVelocity * secondsPassed;
        this.angle = this.originalAngle + Math.PI * secondsPassed * 2;
    };
    return Particle;
})(Sprite);
var Ship = (function (_super) {
    __extends(Ship, _super);
    function Ship() {
        var width = randomInRange(60, 120);
        this.leftToRight = Math.random() > .5;
        this.originalAngle = this.leftToRight ? Math.PI : 0;
        var x = this.leftToRight ? 0 : canvasWidth;
        var y = Math.floor((Math.random() * 5)) * (shipHeight + spaceBetweenShips) + shipHeight / 2 + spaceBetweenShips;
        var velocity = randomInRange(150, 600);
        _super.call(this, x, y, this.originalAngle, width, shipHeight, 1, "white", velocity);
        this.goingDown = false;
        this.lastAnimated = getNow();
        this.turn(this.originalAngle);
    }
    Ship.prototype.turn = function (newAngle) {
        this.angle = newAngle;
        this.cosAngle = Math.cos(this.angle);
        this.sinAngle = Math.sin(this.angle);
    };
    Ship.prototype.checkForHits = function (projectileX, projectileY) {
        if (this.goingDown) {
            return false;
        }
        var shipHit = Math.abs(projectileX - this.x) <= this.halfWidth && Math.abs(projectileY - this.y) <= this.halfHeight;
        if (shipHit) {
            var targetAngle = this.leftToRight ? Math.PI * 1.5 : Math.PI / -2;
            this.changeInAngle = targetAngle - this.originalAngle;
            this.goingDown = true;
            this.timeWhenShipWentDown = getNow();
            shipsKilled++;
            return true;
        }
        return false;
    };
    Ship.prototype.animate = function (now) {
        var secondsPassed = (now - this.lastAnimated) / 1000;
        var horizontalVelocity = this.velocity * this.cosAngle;
        var verticalVelocity = this.velocity * this.sinAngle;
        if (this.goingDown) {
            var secondsSinceWentDown = (now - this.timeWhenShipWentDown) / 1000;
            if (secondsSinceWentDown <= shipHitAnimationDurationInSeconds) {
                this.alpha = easeOutCubic(null, secondsSinceWentDown, 1, -.90, shipHitAnimationDurationInSeconds);
                var newAngle = easeOutCubic(null, secondsSinceWentDown, this.originalAngle, this.changeInAngle, shipHitAnimationDurationInSeconds);
                this.turn(newAngle);
            }
            verticalVelocity *= (1 + secondsSinceWentDown);
        }
        else {
            if (config.enableParticles && Math.random() < .1) {
                createParticles(this.x, this.y, now, 10, 30, 1, 1, this.color, 1, 5);
            }
        }
        this.x = this.x - horizontalVelocity * secondsPassed;
        this.y = this.y - verticalVelocity * secondsPassed;
        this.lastAnimated = now;
    };
    return Ship;
})(Sprite);
function createParticles(x, y, now, minVelocity, maxVelocity, minParticles, maxParticles, color, minSize, maxSize) {
    var numberOfParticles = randomInRange(minParticles, maxParticles);
    for (var p = 0; p < numberOfParticles; p++) {
        var particleVelocity = randomInRange(minVelocity, maxVelocity);
        var particle = new Particle(x, y, particleVelocity, minSize, maxSize, color, now);
        sprites.push(particle);
    }
}
function shakeAndMakeBackgroundWhiteIfEnabled() {
    if (config.enableEpilepsy) {
        nextFrameWhite = true;
    }
    if (!isShaking && config.shakingWhenShipsAreHit) {
        isShaking = true;
        $(canvas).shake({
            callback: function () {
                isShaking = false;
            }
        });
    }
}
function updateScene() {
    var now = getNow();
    var replacementsSprites = new Array();
    var ships = new Array(), projectiles = new Array();
    for (var x = 0; x < sprites.length; x++) {
        var sprite = sprites[x];
        sprite.animate(now);
        if (sprite.x < -sprite.halfWidth || sprite.y < 0 || sprite.x > canvasWidth + sprite.halfWidth || sprite.y > canvasHeight) {
            sprite.remove = true;
        }
        if (!sprite.remove) {
            replacementsSprites.push(sprite);
            if (sprite instanceof Ship) {
                ships.push(sprite);
            }
            else if (sprite instanceof Projectile) {
                projectiles.push(sprite);
            }
        }
    }
    ;
    sprites = replacementsSprites;
    for (var i = 0; i < projectiles.length; i++) {
        var projectile = projectiles[i];
        for (var j = 0; j < ships.length; j++) {
            var ship = ships[j];
            var hit = ship.checkForHits(projectile.x, projectile.y);
            if (hit) {
                projectile.remove = true;
                var firstAngle = randomInRange(0, twoPi);
                for (var d = 0; d < numberOfProjectilesLaunchedWhenShipsExplode; d++) {
                    sprites.push(new Projectile(projectile.x, projectile.y, firstAngle * angleBetweenProjectilesCreatedByExplodingShips * d, "yellow"));
                }
                if (config.enableParticles) {
                    createParticles(projectile.x, projectile.y, now, 300, 600, 15, 50, "cyan", 5, 15);
                }
                shakeAndMakeBackgroundWhiteIfEnabled();
                break;
            }
        }
    }
    frameCounter.updateComplete();
    setTimeout(updateScene, 0);
}
function renderFrame(now) {
    if (nextFrameWhite) {
        nextFrameWhite = false;
        context.fillStyle = "#EEEEEE";
        context.fillRect(0, 0, canvasWidth, canvasHeight); // epilepsy inducing flash
    }
    else {
        if (config.motionBlur) {
            var timeBetweenFrames = now - lastTimeFrameWasRendered;
            context.fillStyle = "rgba(0,0,0, " + .009 * timeBetweenFrames + ")";
        }
        else {
            context.fillStyle = "black";
        }
        context.fillRect(0, 0, canvasWidth, canvasHeight); // erase the canvas		
        lastTimeFrameWasRendered = now;
        for (var s = 0; s < sprites.length; s++) {
            var spriteToDraw = sprites[s];
            spriteToDraw.draw();
        }
    }
    frameCounter.frameRendered();
    window.requestAnimationFrame(renderFrame);
}
if (!window.requestAnimationFrame || !window["HTMLCanvasElement"]) {
    alert("Sorry, your browser is not supported.  IE 10+ required");
}
$("#enableFadingObjects").click(function () {
    config.motionBlur = $(this).is(":checked");
});
$("#enableShaking").click(function () {
    config.shakingWhenShipsAreHit = $(this).is(":checked");
});
$("#enableEpilepsy").click(function () {
    config.enableEpilepsy = $(this).is(":checked");
});
$("#enableParticles").click(function () {
    config.enableParticles = $(this).is(":checked");
});
setInterval(function () {
    shotsFiredSpan.text(shotsFired);
    shipsKilledSpan.text(shipsKilled);
    spritesTrackedSpan.text(sprites.length);
}, 200);
$(canvas).on("mousedown", function (e) {
    if (typeof e.offsetX === "undefined" || typeof e.offsetY === "undefined") {
        var targetOffset = $(e.target).offset();
        e.offsetX = e.pageX - targetOffset.left;
        e.offsetY = e.pageY - targetOffset.top;
    }
    var projectileStartX = canvasWidth / 2;
    var projectileStartY = canvasHeight - 1;
    var firingAngle = Math.atan2(projectileStartY - e.offsetY, projectileStartX - e.offsetX);
    sprites.push(new Projectile(projectileStartX, projectileStartY, firingAngle, "Fuchsia"));
    shotsFired++;
});
function launchShips() {
    sprites.push(new Ship());
    setTimeout(launchShips, randomInRange(100, 600));
}
;
launchShips();
updateScene();
renderFrame();
