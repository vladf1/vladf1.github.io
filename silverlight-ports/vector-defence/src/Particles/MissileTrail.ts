import { Sprite } from "../Sprite";
import { Game } from "../Game";

export class MissileTrail extends Sprite {
  private static readonly interval = 1 / 60;

  constructor(x: number, y: number) {
    super();
    this.x = x;
    this.y = y;
  }

  override animate(): void {
    this.alpha -= MissileTrail.interval * Game.currentFrameMultiplier;
    if (this.alpha <= 0) {
      this.markedForRemoval = true;
    }
  }

  override render(context: CanvasRenderingContext2D): void {
    context.save();
    context.globalAlpha = Math.max(0, this.alpha);
    context.fillStyle = "#a9a9a9";
    context.fillRect(this.x - 0.5, this.y - 0.5, 1, 1);
    context.restore();
  }
}
