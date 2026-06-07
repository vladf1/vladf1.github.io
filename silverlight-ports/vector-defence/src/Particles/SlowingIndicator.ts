import { Sprite } from "../Sprite";
import { Game } from "../Game";
import { Util } from "../Util";

export class SlowingIndicator extends Sprite {
  private readonly target: Sprite;
  private readonly lineFrom: Sprite | null;
  private readonly fadeBy: number;
  private readonly color: string;
  private readonly fixedX: number;
  private readonly fixedY: number;

  constructor(x: number, y: number, targetSprite: Sprite);
  constructor(from: Sprite, targetSprite: Sprite);
  constructor(xOrFrom: number | Sprite, yOrTarget: number | Sprite, maybeTarget?: Sprite) {
    super();
    if (typeof xOrFrom === "number") {
      this.fixedX = xOrFrom;
      this.fixedY = yOrTarget as number;
      this.target = maybeTarget as Sprite;
      this.lineFrom = null;
      this.color = "#ffff00";
      this.alpha = 0.8;
      this.fadeBy = Util.calculateIntervalToComplete(1);
    } else {
      this.fixedX = 0;
      this.fixedY = 0;
      this.lineFrom = xOrFrom;
      this.target = yOrTarget as Sprite;
      this.color = "#008000";
      this.alpha = 0.7;
      this.fadeBy = 0;
    }
  }

  override animate(): void {
    if (this.target.markedForRemoval || (this.lineFrom !== null && this.lineFrom.markedForRemoval)) {
      this.alpha = 0;
    } else {
      this.alpha -= this.fadeBy * Game.currentFrameMultiplier;
    }
    if (this.alpha <= 0) {
      this.markedForRemoval = true;
    }
  }

  override render(context: CanvasRenderingContext2D): void {
    const x1 = this.lineFrom !== null ? this.lineFrom.x : this.fixedX;
    const y1 = this.lineFrom !== null ? this.lineFrom.y : this.fixedY;
    context.save();
    context.globalAlpha = Math.max(0, this.alpha);
    context.strokeStyle = this.color;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(this.target.x, this.target.y);
    context.stroke();
    context.restore();
  }
}
