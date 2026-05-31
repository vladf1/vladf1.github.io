// Derived from Terence Tsang's GPL-licensed Shinedraw demo:
// "Flash vs Silverlight - Colorful Fireworks" (2009), shinedraw.com.
// https://web.archive.org/web/20080923132130/http://www.shinedraw.com/animation-effect/flash-vs-silverlight-colorful-fireworks/

const canvas = document.querySelector("#trails");
const context = canvas.getContext("2d");
let hint = document.querySelector("#hint");
let lastTime = performance.now();
let dots = [];

const randomBetween = (min, max) => min + (max - min) * Math.random();

function resizeCanvas() {
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(innerWidth * scale);
  canvas.height = Math.floor(innerHeight * scale);
  context.setTransform(scale, 0, 0, scale, 0, 0);
}

resizeCanvas();
addEventListener("resize", resizeCanvas);

canvas.addEventListener("pointermove", event => {
  hint?.classList.add("is-fading");
  hint = null;

  for (let i = 0; i < 2; i++) {
    dots.push({
      x: event.clientX,
      y: event.clientY,
      size: randomBetween(1, 3),
      color: `rgb(${randomBetween(128, 256)} ${randomBetween(128, 256)} ${randomBetween(128, 256)})`,
      xVelocity: randomBetween(-0.12, 0.12),
      yVelocity: randomBetween(-0.12, 0),
      opacity: 1,
    });
  }
});

requestAnimationFrame(function animate(time) {
  const elapsed = time - lastTime;
  lastTime = time;

  context.clearRect(0, 0, innerWidth, innerHeight);

  for (const dot of dots) {
    dot.opacity -= 0.00036 * elapsed;
    dot.yVelocity += 0.000288 * elapsed;
    dot.x += dot.xVelocity * elapsed;
    dot.y += dot.yVelocity * elapsed;

    for (let i = 0; i < 5; i++) {
      context.globalAlpha = i ? Math.max(0, dot.opacity * (0.75 - 0.15 * i)) : dot.opacity;
      context.fillStyle = i ? dot.color : "white";
      context.beginPath();
      context.arc(dot.x, dot.y, (dot.size * 2 ** Math.max(0, i - 1)) / 2, 0, Math.PI * 2);
      context.fill();
    }
  }

  dots = dots.filter(d => d.opacity > 0.1);
  requestAnimationFrame(animate);
});
