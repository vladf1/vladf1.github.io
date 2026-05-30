import { Sprite } from "../Sprite";
import { Game } from "../Game";
import { Util } from "../Util";

export class ExplosionParticle extends Sprite {
  private readonly size: number;
  private readonly color: string;
  private readonly burnDownSpeed: number;

  constructor(x: number, y: number, particleSize: number, particleColor: string, burnDownPerFrame: number, speed = Util.randomInRange(2, 7), offset = Util.randomInRange(4, 6)) {
    super();
    this.burnDownSpeed = burnDownPerFrame;
    this.size = particleSize;
    this.color = particleColor;
    const angle = Util.randomInRange(-Math.PI, Math.PI);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.dx = speed * cos;
    this.dy = speed * sin;
    this.x = x + (offset * cos);
    this.y = y + (offset * sin);
  }

  override animate(): void {
    const slowDownFactor = 1 - (0.04 * Game.currentFrameMultiplier);
    this.dx *= slowDownFactor;
    this.dy *= slowDownFactor;
    this.updatePosition();

    if (this.isOutsideBounds) {
      this.markedForRemoval = true;
    } else {
      this.alpha -= this.burnDownSpeed * Game.currentFrameMultiplier;
      if (this.alpha <= 0) {
        this.markedForRemoval = true;
      }
    }
  }

  override render(context: CanvasRenderingContext2D): void {
    context.save();
    context.globalAlpha = Math.max(0, this.alpha);
    context.fillStyle = this.color;
    context.fillRect(this.x - (this.size / 2), this.y - (this.size / 2), this.size, this.size);
    context.restore();
  }
}
