(function () {
    var NUMBER_OF_SPRITES = 160, TIME_BETWEEN_FRAMES = 8,
    MIN_COLOR = 40, MAX_VELOCITY = 6,
    MAX_OFFSET_AMOUNT = 10, TOO_FAR = 450, MIN_DISTANCE = 200,
    MAX_RANDOM_ANGLE_CHANGE = 1.5, MAX_CRAZINESS = .1, CHANGE_DIRECTION_FRAMES = 10;

    var bubbles = [];
    var ctx;

    function Bubble(x, y) {
        var dr = randomNonZeroIntInRange(-2, 3); // random change change of colors
        var db = randomNonZeroIntInRange(-2, 2);
        var dg = randomNonZeroIntInRange(-3, 2);
        var speed = MAX_VELOCITY * randomInRange(.4, 1);
        var craziness = randomInRange(0, MAX_CRAZINESS);
        var offsetX = randomInRange(-MAX_OFFSET_AMOUNT, MAX_OFFSET_AMOUNT);
        var offsetY = randomInRange(-MAX_OFFSET_AMOUNT, MAX_OFFSET_AMOUNT);
        var gravityDistance = MIN_DISTANCE * randomInRange(.6, 1.5);

        var angle = randomInRange(0, Math.PI * 2); // randomize direction:
        var dx, dy;

        this.calcVector = function () {
            dx = speed * Math.cos(angle);
            dy = speed * Math.sin(angle);
        }

        this.calcVector();

        var r = randomNonZeroIntInRange(MIN_COLOR, 255);
        var g = randomNonZeroIntInRange(MIN_COLOR, 255);
        var b = randomNonZeroIntInRange(MIN_COLOR, 255);

        var moveAwayTicks = 0;
        var angleChangeTicks = 0, dAngle = null;

        this.startMovingAway = function () {
            var dist = calcDistance(x, y, ctx.pointerX, ctx.pointerY);
            if (dist < gravityDistance) {
                moveAwayTicks = 100;
                r = 255;
                g = 255;
                b = 255;
            }
        }

        this.animate = function () {
            if (ctx.pointerY && ctx.pointerX) {
                var dist = calcDistance(x, y, ctx.pointerX, ctx.pointerY);

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
                        var newAngle = Math.atan2(ctx.pointerY - y + offsetY, ctx.pointerX - x + offsetX);
                        newAngle = normalizeAngle(newAngle);
                        dAngle = difBetweenAngles(newAngle, angle) / angleChangeTicks;
                    }
                }
            }

            if (angleChangeTicks == 0 && Math.random() < craziness) {
                var angleChange = randomInRange(-MAX_RANDOM_ANGLE_CHANGE, MAX_RANDOM_ANGLE_CHANGE);
                dAngle = angleChange / CHANGE_DIRECTION_FRAMES;
                angleChangeTicks = CHANGE_DIRECTION_FRAMES;
            }
            if (angleChangeTicks != 0) {
                angle += dAngle;
                angle = normalizeAngle(angle);
                this.calcVector();
                angleChangeTicks--;
            }

            var bounced = false;
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

            if (moveAwayTicks == 0) {
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
            ctx.strokeStyle = "rgb(" + r + "," + g + "," + b + ")";
            ctx.stroke();
            ctx.closePath();
        }
    }

    function renderFrame() {
        clearScreen(ctx);
        ctx.lineWidth = 5;
        ctx.lineCap = "round";

        for (var i = 0; i < bubbles.length; i++) {
            var b = bubbles[i];
            b.savePosition();
            b.animate();
            b.draw();
        }
        FrameCounter.showFps(ctx);

        setTimeout(renderFrame, TIME_BETWEEN_FRAMES);
    }

    $(document).ready(function () {
        var canvas = document.getElementById("c");
        if (!canvas.getContext)
            return;

        ctx = canvas.getContext("2d");

        window.onresize = function () {
            canvas.height = document.documentElement.clientHeight;
            canvas.width = Math.min(1200, document.documentElement.clientWidth);
        };
        window.onresize();

        for (var i = 0; i < NUMBER_OF_SPRITES; i++) {
            var startPosX = randomInRange(MAX_VELOCITY, ctx.canvas.width - MAX_VELOCITY);
            var startPosY = randomInRange(MAX_VELOCITY, ctx.canvas.height - MAX_VELOCITY);
            bubbles.push(new Bubble(startPosX, startPosY));
        }

        $(canvas).mousemove(function (e) {
            ctx.pointerX = e.pageX;
            ctx.pointerY = e.pageY;
        });

        $(canvas).mouseout(function () {
            ctx.pointerX = ctx.pointerY = null;
        });

        $(canvas).click(function (e) {
            var replaceSprites = parseInt(NUMBER_OF_SPRITES / 10);
            bubbles.splice(0, replaceSprites);
            for (var i = 0; i < replaceSprites; i++) {
                bubbles.push(new Bubble(e.pageX + randomInRange(-1, 1), e.pageY + randomInRange(-1, 1)));
            }

            for (var i = 0; i < bubbles.length; i++) {
                bubbles[i].startMovingAway();
            }
        });

        FrameCounter.startTimer();
        renderFrame();
    });
})();