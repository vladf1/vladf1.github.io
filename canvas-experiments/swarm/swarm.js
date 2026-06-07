import {
    CanvasFpsCounter,
    calcDistance,
    clearScreen,
    difBetweenAngles,
    normalizeAngle,
    randomInRange,
    randomNonZeroIntInRange,
} from "../shared/common.js";

(function () {
    const NUMBER_OF_SPRITES = 160, TIME_BETWEEN_FRAMES = 8,
    MIN_COLOR = 40, MAX_VELOCITY = 6,
    MAX_OFFSET_AMOUNT = 10, TOO_FAR = 450, MIN_DISTANCE = 200,
    MAX_RANDOM_ANGLE_CHANGE = 1.5, MAX_CRAZINESS = .1, CHANGE_DIRECTION_FRAMES = 10;

    const bubbles = [];
    let ctx;

    function Bubble(x, y) {
        let dr = randomNonZeroIntInRange(-2, 3); // random change change of colors
        let db = randomNonZeroIntInRange(-2, 2);
        let dg = randomNonZeroIntInRange(-3, 2);
        const speed = MAX_VELOCITY * randomInRange(.4, 1);
        const craziness = randomInRange(0, MAX_CRAZINESS);
        const offsetX = randomInRange(-MAX_OFFSET_AMOUNT, MAX_OFFSET_AMOUNT);
        const offsetY = randomInRange(-MAX_OFFSET_AMOUNT, MAX_OFFSET_AMOUNT);
        const gravityDistance = MIN_DISTANCE * randomInRange(.6, 1.5);

        let angle = randomInRange(0, Math.PI * 2); // randomize direction:
        let dx, dy;

        this.calcVector = function () {
            dx = speed * Math.cos(angle);
            dy = speed * Math.sin(angle);
        }

        this.calcVector();

        let r = randomNonZeroIntInRange(MIN_COLOR, 255);
        let g = randomNonZeroIntInRange(MIN_COLOR, 255);
        let b = randomNonZeroIntInRange(MIN_COLOR, 255);

        let moveAwayTicks = 0;
        let angleChangeTicks = 0, dAngle = null;

        this.startMovingAway = function () {
            const dist = calcDistance(x, y, ctx.pointerX, ctx.pointerY);
            if (dist < gravityDistance) {
                moveAwayTicks = 100;
                r = 255;
                g = 255;
                b = 255;
            }
        }

        this.animate = function () {
            if (ctx.pointerY && ctx.pointerX) {
                const dist = calcDistance(x, y, ctx.pointerX, ctx.pointerY);

                if (moveAwayTicks > 0) { // repelling move
                    if (dist < gravityDistance) {
                        angleChangeTicks = 0;
                        angle = Math.atan2(y - ctx.pointerY, x - ctx.pointerX);
                        angle = normalizeAngle(angle);
                        this.calcVector();
                    }
                }
                else { // attraction mode
                    if (dist > gravityDistance && dist < TOO_FAR) {
                        angleChangeTicks = 5;
                        let newAngle = Math.atan2(ctx.pointerY - y + offsetY, ctx.pointerX - x + offsetX);
                        newAngle = normalizeAngle(newAngle);
                        dAngle = difBetweenAngles(newAngle, angle) / angleChangeTicks;
                    }
                }
            }

            if (angleChangeTicks === 0 && Math.random() < craziness) {
                const angleChange = randomInRange(-MAX_RANDOM_ANGLE_CHANGE, MAX_RANDOM_ANGLE_CHANGE);
                dAngle = angleChange / CHANGE_DIRECTION_FRAMES;
                angleChangeTicks = CHANGE_DIRECTION_FRAMES;
            }
            if (angleChangeTicks !== 0) {
                angle += dAngle;
                angle = normalizeAngle(angle);
                this.calcVector();
                angleChangeTicks--;
            }

            let bounced = false;
            if (y + dy < 0) {
                y = 0;
                dy *= -1;
                bounced = true;
            }
            else if (y + dy > ctx.canvas.height) {
                y = ctx.canvas.height;
                dy *= -1;
                bounced = true;
            }

            if (x + dx < 0) {
                x = 0;
                dx *= -1;
                bounced = true;
            }
            else if (x + dx > ctx.canvas.width) {
                x = ctx.canvas.width;
                dx *= -1;
                bounced = true;
            }
            if (bounced) {
                angle = Math.atan2(dy, dx);
                angle = normalizeAngle(angle);
            }

            y += dy; // move
            x += dx;

            if (moveAwayTicks === 0) {
                if (r >= 255 || r <= MIN_COLOR) {
                    dr *= -1;
                }
                r += dr;
                if (b >= 255 || b <= MIN_COLOR) {
                    db *= -1;
                }
                b += db;
                if (g >= 255 || g <= MIN_COLOR) {
                    dg *= -1;
                }
                g += dg;
            }
            else {
                moveAwayTicks--;
            }
        }

        this.savePosition = function () {
            ctx.beginPath();
            ctx.moveTo(x, y);
        }

        this.draw = function () {
            ctx.lineTo(x, y);
            ctx.strokeStyle = `rgb(${r},${g},${b})`;
            ctx.stroke();
            ctx.closePath();
        }
    }

    function renderFrame() {
        clearScreen(ctx);
        ctx.lineWidth = 5;
        ctx.lineCap = "round";

        for (const bubble of bubbles) {
            bubble.savePosition();
            bubble.animate();
            bubble.draw();
        }
        CanvasFpsCounter.showFps(ctx);

        setTimeout(renderFrame, TIME_BETWEEN_FRAMES);
    }

    document.addEventListener("DOMContentLoaded", () => {
        const canvas = document.getElementById("c");
        if (!canvas.getContext)
            return;

        ctx = canvas.getContext("2d");

        window.onresize = () => {
            canvas.height = document.documentElement.clientHeight;
            canvas.width = Math.min(1200, document.documentElement.clientWidth);
        };
        window.onresize();

        for (let i = 0; i < NUMBER_OF_SPRITES; i++) {
            const startPosX = randomInRange(MAX_VELOCITY, ctx.canvas.width - MAX_VELOCITY);
            const startPosY = randomInRange(MAX_VELOCITY, ctx.canvas.height - MAX_VELOCITY);
            bubbles.push(new Bubble(startPosX, startPosY));
        }

        canvas.addEventListener("mousemove", (e) => {
            ctx.pointerX = e.pageX;
            ctx.pointerY = e.pageY;
        });

        canvas.addEventListener("mouseout", () => {
            ctx.pointerX = ctx.pointerY = null;
        });

        canvas.addEventListener("click", (e) => {
            const replaceSprites = Math.floor(NUMBER_OF_SPRITES / 10);
            bubbles.splice(0, replaceSprites);
            for (let i = 0; i < replaceSprites; i++) {
                bubbles.push(new Bubble(e.pageX + randomInRange(-1, 1), e.pageY + randomInRange(-1, 1)));
            }

            for (const bubble of bubbles) {
                bubble.startMovingAway();
            }
        });

        CanvasFpsCounter.startTimer();
        renderFrame();
    });
})();
