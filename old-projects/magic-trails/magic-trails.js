// Derived from Terence Tsang's GPL-licensed Shinedraw demo:
// "Flash vs Silverlight - Colorful Fireworks" (2009), shinedraw.com.
// https://web.archive.org/web/20080923132130/http://www.shinedraw.com/animation-effect/flash-vs-silverlight-colorful-fireworks/

const canvas = document.querySelector("#trails");
const cover = document.querySelector("#cover");
const context = canvas.getContext("2d");
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

canvas.addEventListener("pointermove", (event) => {
  const maxVelocity = 5;

  for (let i = 0; i < 2; i++) {
    dots.push({
      x: event.clientX,
      y: event.clientY,
      size: randomBetween(1, 3),
      color: `rgb(${randomBetween(128, 256)} ${randomBetween(128, 256)} ${randomBetween(128, 256)})`,
      xVelocity: randomBetween(-maxVelocity, maxVelocity),
      yVelocity: randomBetween(-maxVelocity, 0),
      opacity: 1,
    });
  }
});

cover.addEventListener("click", () => {
  cover.remove();

  setInterval(() => {
    context.clearRect(0, 0, innerWidth, innerHeight);

    for (const dot of dots) {
      dot.opacity -= 0.015;
      dot.yVelocity += 0.5;
      dot.x += dot.xVelocity;
      dot.y += dot.yVelocity;

      for (let i = 0; i < 5; i++) {
        context.globalAlpha = i ? Math.max(0, dot.opacity * (0.75 - 0.15 * i)) : dot.opacity;
        context.fillStyle = i ? dot.color : "white";
        context.beginPath();
        context.arc(dot.x, dot.y, (dot.size * 2 ** Math.max(0, i - 1)) / 2, 0, Math.PI * 2);
        context.fill();
      }
    }

    dots = dots.filter(d => d.opacity > 0.1);
  }, 1000 / 24); // 24 fps
});
