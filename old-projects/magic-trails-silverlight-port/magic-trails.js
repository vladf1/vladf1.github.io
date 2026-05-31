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

class MagicDot {
  opacity = 1;

  constructor(x, y) {
    const maxVelocity = 5;

    this.x = x;
    this.y = y;
    this.size = randomBetween(1, 3);
    this.color = `rgb(${randomBetween(128, 256)} ${randomBetween(128, 256)} ${randomBetween(128, 256)})`;
    this.xVelocity = randomBetween(-maxVelocity, maxVelocity);
    this.yVelocity = randomBetween(-maxVelocity, 0);
  }

  update() {
    this.opacity -= 0.02;
    this.yVelocity += 0.5;
    this.x += this.xVelocity;
    this.y += this.yVelocity;
  }

  draw() {
    let size = this.size;

    context.save();
    context.globalAlpha = this.opacity;
    context.fillStyle = "white";
    context.beginPath();
    context.arc(this.x, this.y, size / 2, 0, Math.PI * 2);
    context.fill();

    // rings
    let ringOpacity = 0.6;

    for (let i = 1; i < 5; i++) {
      context.globalAlpha = Math.max(0, this.opacity * ringOpacity);
      context.fillStyle = this.color;
      context.beginPath();
      context.arc(this.x, this.y, size / 2, 0, Math.PI * 2);
      context.fill();
      size *= 2;
      ringOpacity -= 0.15;
    }

    context.restore();
  }
}

resizeCanvas();
addEventListener("resize", resizeCanvas);

canvas.addEventListener("pointermove", (event) => {
  for (let i = 0; i < 2; i++) {
    dots.push(new MagicDot(event.clientX, event.clientY));
  }
});

cover.addEventListener("click", () => {
  cover.remove();

  setInterval(() => {
    context.clearRect(0, 0, innerWidth, innerHeight);

    for (const dot of dots) {
      dot.update();
      dot.draw();
    }
    dots = dots.filter((dot) => dot.opacity > 0.1);
  }, 1000 / 24); // 24 fps
});
