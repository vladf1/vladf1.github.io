var TIME_BETWEEN_FRAMES = 1, BaseTicksPerFrame = 1000 / 60;
var HALF_PI = Math.PI / 2, MAX_SHIP_SPEED = 5, BULLET_SPEED = 5;
var sprites = [], ctx;
var targets = [];
var timeTargetsCreated;

function Target(x, y) {
    this.x = x;
    this.y = y;

    this.clear = function () {
        ctx.clearRect(x - 30, y - 30, 60, 60);
    }

    this.render = function () {
        ctx.fillStyle = "red";
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, TWO_PI, false);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, TWO_PI, false);
        ctx.closePath();
        ctx.fill();
    };

    
}

function Bullet(x, y, originalAngle, speed) {
    var dx = speed * Math.cos(originalAngle);
    var dy = speed * Math.sin(originalAngle);

    this.animate = function (multiplier) {
        if (y < 0 || y > ctx.canvas.height || x < 0 || x > ctx.canvas.width) {
            removeByValue(sprites, this);
        }

        var cdx = multiplier * dx;
        var cdy = multiplier * dy;

        y += cdy; // move
        x += cdx;

        this.checkForHitTargets();
    };

    this.checkForHitTargets = function () {
        for (var i = 0; i < targets.length; i++) {
            var t = targets[i];
            var collided = !isOutsideDistance(x, y, t.x, t.y, 25);
            if (collided) {
                removeByValue(sprites, this);
                removeByValue(targets, t);
                if (targets.length == 0) {
                    handleAllTargetsDestroyed();
                }
                break;
            }
        }

    };

    this.clear = function () {
        var margin = 5;
        ctx.clearRect(x - margin, y - margin, margin * 2, margin * 2); // erase the canvas
    }

    this.render = function () {
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, TWO_PI, false);
        ctx.closePath();
        ctx.fill();
    };
}



function Ship(x, y) {
    var lengthOfTheShip = 100, widthOfTheShip = 50;
    var halfWidth = widthOfTheShip / 2;
    var lastFired = 0;

    this.speed = 3;
    this.throttle = false;

    this.angleChange = 0;

    var angle, cos, sin;
    var xL, yL;

    this.setAngle = function (newAngle) {
        angle = fixAngle(newAngle);
        cos = Math.cos(angle);
        sin = Math.sin(angle);

        var angleLeft = angle - HALF_PI;
        xL = halfWidth * Math.cos(angleLeft);
        yL = halfWidth * Math.sin(angleLeft);
    };

    this.setAngle(randomInRange(-Math.PI, Math.PI));

    this.fire = function () {
        var now = new Date().getTime();
        if (lastFired != 0)
        {
            var timeBetweenFires = now - lastFired;
            if (timeBetweenFires < 150)
                return;
        }
        lastFired = now;

        var bullet = new Bullet(this.bowX, this.bowY, angle, this.speed + BULLET_SPEED);
        sprites.push(bullet);
    };

    this.animate = function (multiplier) {
        if (this.throttle) {
            if (this.speed < MAX_SHIP_SPEED) {
                this.speed += (.10 * multiplier);
            }
        }
        else {
            if (this.speed > 0) {
                this.speed -= (.03 * multiplier);
            }
        }

        if (this.angleChange != 0) {
            var newAngle = angle + (this.angleChange * multiplier);
            this.setAngle(newAngle);
        }

        if (y < 0) {
            y = ctx.canvas.height;
        }
        else if (y > ctx.canvas.height) {
            y = 0;
        }
        if (x < 0) {
            x = ctx.canvas.width;
        }
        else if (x > ctx.canvas.width) {
            x = 0;
        }

        var dx = multiplier * this.speed * cos;
        var dy = multiplier * this.speed * sin;
        y += dy; // move
        x += dx;
    };

    this.clear = function () {
        var margin = lengthOfTheShip + 5;
        ctx.clearRect(x - margin, y - margin, margin * 2, margin * 2); // erase the canvas
    };

    this.turnTo = function (mx, my) {
        var newAngle = Math.atan2(my - y, mx - x);
        this.setAngle(newAngle);
        this.speed = MAX_SHIP_SPEED * .8;
    };

    this.render = function () {
        ctx.save();
        this.bowX = x + lengthOfTheShip * cos;
        this.bowY = y + lengthOfTheShip * sin;


        var shipGradient = ctx.createLinearGradient(x, y, this.bowX, this.bowY);
        shipGradient.addColorStop(0, "blue");
        shipGradient.addColorStop(1, "orange");

        ctx.fillStyle = shipGradient; // "white";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + xL, y + yL);  // left vertex
        ctx.lineTo(x - xL, y - yL);  // right vertex
        ctx.lineTo(this.bowX, this.bowY); // top point
        ctx.lineTo(x + xL, y + yL); // left vertex
        ctx.closePath();
        ctx.fill();

        // fire
        var xt = x - 6 * this.speed * cos;
        var yt = y - 6 * this.speed * sin;

        var fireGradient = ctx.createLinearGradient(x, y, xt, yt);
        fireGradient.addColorStop(0, "black");
        fireGradient.addColorStop(.15, "red");
        fireGradient.addColorStop(1, "black");

        ctx.strokeStyle = fireGradient;
        ctx.lineWidth = widthOfTheShip - 8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(xt, yt);
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
    };

    this.render();
}


function createTargets() {
    var NUMBER_OF_TARGETS = 5;
    timeTargetsCreated = new Date().getTime();
    // create targets
    var targetMargin = 50;
    for (var i = 0; i < NUMBER_OF_TARGETS; i++) {
        var t = new Target(randomInRange(targetMargin, ctx.canvas.width - targetMargin), randomInRange(targetMargin, ctx.canvas.height - targetMargin));
        targets.push(t);
    }
}

function handleAllTargetsDestroyed() {
    var timeTaken = Math.round((new Date().getTime() - timeTargetsCreated) / 1000);
    var best = localStorage["bestTime"];
    if (!best || best == 0) {
        best = timeTaken;
    }
    best = Math.min(best, timeTaken);
    localStorage["bestTime"] = best;
    
    ctx.clearRect(0, ctx.canvas.height - 20, 300, 20); 
    ctx.textBaseline = "top";
    ctx.font = "14pt Arial";
    ctx.fillStyle = "white";
    ctx.fillText("best time: " + best + ", time taken: " + timeTaken, 5, ctx.canvas.height - 20);

    var frame = 22;
    (function clearResults() {
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0, .15)";
        ctx.fillRect(0, ctx.canvas.height - 20, 300, 20);
        ctx.restore();
        if (frame > 0) {
            setTimeout(clearResults, 50);
        }
        else {
            createTargets();
        }

        frame -= 1;
    })();
    
}

window.onload = function () {
    var canvas = document.getElementById("c");
    if (!canvas.getContext) {
        return;
    }
    ctx = canvas.getContext("2d");

    window.onresize = function () {
        canvas.width = document.documentElement.clientWidth;
        canvas.height = document.documentElement.clientHeight;
    }
    window.onresize();

    var ship = new Ship(canvas.width / 2, canvas.height * .75);
    sprites.push(ship);


    createTargets();

    document.onkeydown = function (e) {
        if (e.keyCode == 38) { // up
            ship.throttle = true;
            return false;
        }
        else if (e.keyCode == 40) { // down
            //todo: break
            return false;
        }
        else if (e.keyCode == 37) { // left
            ship.angleChange = -.04;
            return false;
        }
        else if (e.keyCode == 39) { // right
            ship.angleChange = .04;
            return false;
        }
        else if (e.keyCode == 32) { // space
            // fire
            ship.fire();
            return false;
        }
    };


    document.onkeyup = function (e) {
        if (e.keyCode == 38) { // up
            ship.throttle = false;
            return false;
        }
        else if (e.keyCode == 40) { // down

            return false;
        }
        else if (e.keyCode == 37) { // left
            ship.angleChange = 0;
            return false;
        }
        else if (e.keyCode == 39) { // right
            ship.angleChange = 0;
            return false;
        }

    };

    document.onmousedown = function (e) {
        ship.turnTo(e.clientX, e.clientY);
        setTimeout(function () { ship.fire(); }, 100);
        //ship.fire();
    };



    FrameCounter.startTimer();

    var lastAnimated = 0;

    (function renderFrame() {
        var multiplier = 0;
        var now = new Date().getTime();
        if (lastAnimated != 0)  // skip first frame
        {
            var timeBetweenFrames = now - lastAnimated;
            multiplier = timeBetweenFrames / BaseTicksPerFrame;
        }
        lastAnimated = now;

        for (var i = 0; i < targets.length; i++) {
            targets[i].clear();
        }

        for (var i = 0; i < sprites.length; i++) {
            sprites[i].clear();
        }

        for (var i = 0; i < sprites.length; i++) {
            sprites[i].animate(multiplier);
        }

        for (var i = 0; i < targets.length; i++) {
            targets[i].render();
        }


        for (var i = 0; i < sprites.length; i++) {
            sprites[i].render();
        }

        ctx.clearRect(0, 0, 40, 20); // clear box for fps
        FrameCounter.showFps(ctx);

        setTimeout(renderFrame, TIME_BETWEEN_FRAMES);
    })();
};