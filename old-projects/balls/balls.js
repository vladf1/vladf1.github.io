class Ball {
    static maxVelocity = 0.5;
    static twoPi = Math.PI * 2;

    constructor(originalX, originalY, originalRadius) {
        this.angle = this.getRandomValueInRange(0, Ball.twoPi);
        this.dx = Ball.maxVelocity * Math.cos(this.angle);
        this.dy = Ball.maxVelocity * Math.sin(this.angle);
        this.x = originalX;
        this.y = originalY;
        this.radius = originalRadius;

        const r = Math.floor(this.getRandomValueInRange(10, 255));
        const g = Math.floor(this.getRandomValueInRange(10, 255));
        const b = Math.floor(this.getRandomValueInRange(10, 255));
        this.fillStyle = `rgb(${r},${g},${b})`;
    }

    getRandomValueInRange(minVal, maxVal) {
        return minVal + Math.random() * (maxVal - minVal);
    }

    isOutsideDistance(x2, y2, dist) {
        const xdif = Math.abs(this.x - x2);
        if (dist <= xdif) {
            return true;
        }

        const ydif = Math.abs(this.y - y2);
        if (dist <= ydif) {
            return true;
        }

        const sumOfSquares = xdif ** 2 + ydif ** 2;
        const sqrDist = dist ** 2;
        return sqrDist <= sumOfSquares;
    }

    checkForCollisionsWithOtherBalls(balls) {
        for (const otherBall of balls) {
            if (otherBall === this) {
                continue;
            }

            const collided = this.isCollided(otherBall.x, otherBall.y, otherBall.radius);
            if (!collided) {
                continue;
            }

            const combinedSpeed = this.getSpeed() + otherBall.getSpeed() * 0.98; // some loss of speed from collision
            const thisBallRatio = 1 - this.radius / (this.radius + otherBall.radius);
            const newSpeed = combinedSpeed * thisBallRatio;

            this.angle = Math.atan2(this.y - otherBall.y, this.x - otherBall.x);
            this.dx = newSpeed * Math.cos(this.angle);
            this.dy = newSpeed * Math.sin(this.angle);
        }
    }

    getSpeed() {
        return Math.hypot(this.dx, this.dy);
    }

    flyAway(x, y, minDistance, speed) {
        const collided = this.isCollided(x, y, minDistance);
        if (collided) {
            this.angle = Math.atan2(this.y - y, this.x - x);
            this.dx = speed * Math.cos(this.angle);
            this.dy = speed * Math.sin(this.angle);
        }
    }

    isCollided(x, y, otherObjectRadius) {
        const distance = this.radius + otherObjectRadius;
        return !this.isOutsideDistance(x, y, distance);
    }

    calculateNewPosition(millisecondsSinceLastRender, canvasWidth, canvasHeight) {
        let changeY = millisecondsSinceLastRender * this.dy;
        let changeX = millisecondsSinceLastRender * this.dx;

        if (this.y + changeY - this.radius < 0) {
            this.y = this.radius;
            changeY *= -1;
            this.dy *= -1;
        } else if (this.y + this.dy + this.radius > canvasHeight) {
            this.y = canvasHeight - this.radius;
            this.dy *= -1;
            changeY *= -1;
        }

        if (this.x + changeX - this.radius < 0) {
            this.x = this.radius;
            this.dx *= -1;
            changeX *= -1;
        } else if (this.x + changeX + this.radius > canvasWidth) {
            this.x = canvasWidth - this.radius;
            this.dx *= -1;
            changeX *= -1;
        }

        this.y += changeY;
        this.x += changeX;
    }

    draw(context) {
        context.fillStyle = this.fillStyle;
        context.beginPath();
        context.arc(this.x, this.y, this.radius, 0, Ball.twoPi, false);
        context.closePath();
        context.fill();
    }
}

class Scene {
    constructor() {
        this.balls = [];
        this.lastAnimated = 0;

        const statusBarElement = document.getElementById("statusBar");
        this.frameCounter = new FrameCounter((frames, updates) => {
            statusBarElement.innerHTML = `${frames} frames / sec, ${updates} updates / sec`;
        });

        const canvas = document.getElementById("canvas");
        this.context = canvas.getContext("2d");

        window.onresize = () => {
            this.width = canvas.width = document.documentElement.clientWidth;
            this.height = canvas.height = document.documentElement.clientHeight;
        };
        window.onresize();

        canvas.onclick = (e) => {
            for (const ball of this.balls) {
                ball.flyAway(e.clientX, e.clientY, 900, 0.5); // fly away faster
            }
        };

        const numberOfBalls = 35;
        for (let i = 0; i < numberOfBalls; i++) {
            this.tryToCreateBallInEmptySpace();
        }
    }

    getRandomValueInRange(minVal, maxVal) {
        return minVal + Math.random() * (maxVal - minVal);
    }

    tryToCreateBallInEmptySpace() {
        for (let attempt = 0; attempt < 50; attempt++) {
            const radius = this.getRandomValueInRange(15, 45);
            const margin = radius + 10;
            const startPosX = this.getRandomValueInRange(margin, this.width - margin);
            const startPosY = this.getRandomValueInRange(margin, this.height - margin);

            const collidedWithExistingBall = this.balls.some((otherBubble) => {
                return otherBubble.isCollided(startPosX, startPosY, radius);
            });

            if (!collidedWithExistingBall) {
                this.balls.push(new Ball(startPosX, startPosY, radius));
                return;
            }
        }
    }

    renderScene() {
        this.context.clearRect(0, 0, this.width, this.height); // erase the canvas
        for (const ball of this.balls) {
            ball.draw(this.context);
        }
        this.frameCounter.frameRendered();
        requestAnimationFrame(() => this.renderScene());
    }

    updateScene() {
        const now = performance.now();
        const millisecondsSinceLastRender = this.lastAnimated !== 0 ? now - this.lastAnimated : 0;
        this.lastAnimated = now;

        for (const ball of this.balls) {
            ball.checkForCollisionsWithOtherBalls(this.balls);
        }
        for (const ball of this.balls) {
            ball.calculateNewPosition(millisecondsSinceLastRender, this.width, this.height);
        }

        this.frameCounter.updateComplete();
        setTimeout(() => this.updateScene());
    }
}

window.onload = () => {
    const game = new Scene();
    game.updateScene();
    game.renderScene();
};
