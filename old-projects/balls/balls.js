var Ball = (function () {
    function Ball(originalX, originalY, originalRadius) {
        this.angle = this.getRandomValueInRange(0, Ball.twoPi);
        this.dx = Ball.maxVelocity * Math.cos(this.angle);
        this.dy = Ball.maxVelocity * Math.sin(this.angle);
        this.x = originalX;
        this.y = originalY;
        this.radius = originalRadius;
        var r = Math.floor(this.getRandomValueInRange(10, 255));
        var g = Math.floor(this.getRandomValueInRange(10, 255));
        var b = Math.floor(this.getRandomValueInRange(10, 255));
        this.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
    }
    Ball.prototype.getRandomValueInRange = function (minVal, maxVal) {
        return minVal + (Math.random() * (maxVal - minVal));
    };
    Ball.prototype.isOutsideDistance = function (x2, y2, dist) {
        var xdif = Math.abs(this.x - x2);
        if (dist <= xdif)
            return true;
        var ydif = Math.abs(this.y - y2);
        if (dist <= ydif)
            return true;
        var sumOfSquares = Math.pow(xdif, 2) + Math.pow(ydif, 2);
        var sqrDist = Math.pow(dist, 2);
        return sqrDist <= sumOfSquares;
    };
    Ball.prototype.checkForCollisionsWithOtherBalls = function (balls) {
        var _this = this;
        balls.forEach(function (otherBall) {
            if (otherBall === _this)
                return;
            var collided = _this.isCollided(otherBall.x, otherBall.y, otherBall.radius);
            if (!collided)
                return;
            var combinedSpeed = _this.getSpeed() + otherBall.getSpeed() * .98; // some loss of speed from collision
            var thisBallRatio = 1 - _this.radius / (_this.radius + otherBall.radius);
            var newSpeed = combinedSpeed * thisBallRatio;
            _this.angle = Math.atan2(_this.y - otherBall.y, _this.x - otherBall.x);
            _this.dx = newSpeed * Math.cos(_this.angle);
            _this.dy = newSpeed * Math.sin(_this.angle);
        });
    };
    Ball.prototype.getSpeed = function () {
        return Math.sqrt(this.dx * this.dx + this.dy * this.dy);
    };
    Ball.prototype.flyAway = function (x, y, minDistance, speed) {
        var collided = this.isCollided(x, y, minDistance);
        if (collided) {
            this.angle = Math.atan2(this.y - x, this.x - x);
            this.dx = speed * Math.cos(this.angle);
            this.dy = speed * Math.sin(this.angle);
        }
    };
    Ball.prototype.isCollided = function (x, y, otherObjectRadius) {
        var distance = this.radius + otherObjectRadius;
        var collided = !this.isOutsideDistance(x, y, distance);
        return collided;
    };
    Ball.prototype.calculateNewPosition = function (millisecondsSinceLastRender, canvasWidth, canvasHeight) {
        var changeY = millisecondsSinceLastRender * this.dy;
        var changeX = millisecondsSinceLastRender * this.dx;
        if (this.y + changeY - this.radius < 0) {
            this.y = this.radius;
            changeY *= -1;
            this.dy *= -1;
        }
        else {
            if (this.y + this.dy + this.radius > canvasHeight) {
                this.y = canvasHeight - this.radius;
                this.dy *= -1;
                changeY *= -1;
            }
        }
        if (this.x + changeX - this.radius < 0) {
            this.x = this.radius;
            this.dx *= -1;
            changeX *= -1;
        }
        else {
            if (this.x + changeX + this.radius > canvasWidth) {
                this.x = canvasWidth - this.radius;
                this.dx *= -1;
                changeX *= -1;
            }
        }
        this.y += changeY; // move
        this.x += changeX;
    };
    Ball.prototype.draw = function (context) {
        context.fillStyle = this.fillStyle;
        context.beginPath();
        context.arc(this.x, this.y, this.radius, 0, Ball.twoPi, false);
        context.closePath();
        context.fill();
    };
    Ball.maxVelocity = .5;
    Ball.twoPi = Math.PI * 2;
    return Ball;
})();
var Scene = (function () {
    function Scene() {
        var _this = this;
        this.balls = new Array();
        this.lastAnimated = 0;
        var statusBarElement = document.getElementById("statusBar");
        this.frameCounter = new FrameCounter(function (frames, updates) {
            statusBarElement.innerHTML = frames + " frames / sec, " + updates + " updates / sec";
        });
        var nowOffset = Date.now(); // in case performance.now is not supported
        this.getNow = window.performance && window.performance.now ? function () { return window.performance.now(); } : function () { return Date.now() - nowOffset; };
        var canvas = document.getElementById("canvas");
        this.context = canvas.getContext("2d");
        window.onresize = function () {
            _this.width = canvas.width = document.documentElement.clientWidth;
            _this.height = canvas.height = document.documentElement.clientHeight;
        };
        window.onresize(null);
        canvas.onclick = function (e) {
            _this.balls.forEach(function (b) {
                b.flyAway(e.clientX, e.clientY, 900, .5); // fly away faster
            });
        };
        var numberOfBalls = 35;
        for (var i = 0; i < numberOfBalls; i++) {
            this.tryToCreateBallInEmptySpace();
        }
    }
    Scene.prototype.getRandomValueInRange = function (minVal, maxVal) {
        return minVal + (Math.random() * (maxVal - minVal));
    };
    Scene.prototype.tryToCreateBallInEmptySpace = function () {
        for (var attempt = 0; attempt < 50; attempt++) {
            var radius = this.getRandomValueInRange(15, 45);
            var margin = radius + 10;
            var startPosX = this.getRandomValueInRange(margin, this.width - margin);
            var startPosY = this.getRandomValueInRange(margin, this.height - margin);
            var notCollidedWithAnyExistingBall = true;
            for (var i = 0; i < this.balls.length; i++) {
                var otherBubble = this.balls[i];
                var collided = otherBubble.isCollided(startPosX, startPosY, radius);
                if (collided) {
                    notCollidedWithAnyExistingBall = false;
                    break;
                }
            }
            if (notCollidedWithAnyExistingBall) {
                var newBall = new Ball(startPosX, startPosY, radius);
                this.balls.push(newBall);
                return;
            }
        }
    };
    Scene.prototype.renderScene = function () {
        var _this = this;
        this.context.clearRect(0, 0, this.width, this.height); // erase the canvas
        this.balls.forEach(function (b) {
            b.draw(_this.context);
        });
        this.frameCounter.frameRendered();
        requestAnimationFrame(function () { return _this.renderScene(); });
    };
    Scene.prototype.updateScene = function () {
        var _this = this;
        var now = this.getNow();
        var millisecondsSinceLastRender = this.lastAnimated !== 0 ? now - this.lastAnimated : 0;
        this.lastAnimated = now;
        this.balls.forEach(function (b) {
            b.checkForCollisionsWithOtherBalls(_this.balls);
        });
        this.balls.forEach(function (b) {
            b.calculateNewPosition(millisecondsSinceLastRender, _this.width, _this.height);
        });
        this.frameCounter.updateComplete();
        setTimeout(function () { return _this.updateScene(); });
    };
    return Scene;
})();
window.onload = function () {
    var game = new Scene();
    game.updateScene();
    game.renderScene();
};
