import { Point } from "../Point";
import { Sprite } from "../Sprite";
import { Game } from "../Game";
import { Util } from "../Util";

export class LaserRay extends Sprite {
  private static readonly laserLength = 1000;
  private source = new Point(0, 0);
  private target = new Point(0, 0);
  private damagePerHit = 1;
  private strokeThickness = 1.5;

  constructor() {
    super();
    this.alpha = 0;
    this.setLevel(0);
  }

  get isOn(): boolean {
    return this.alpha > 0;
  }

  setLevel(level: number): void {
    this.damagePerHit = 1 + (level / 4);
    this.strokeThickness = 1.5 + (level / 3);
  }

  fireAt(sourcePoint: Point, targetPoint: Point): void {
    this.alpha = 1;
    this.turnTo(sourcePoint, targetPoint);
  }

  turnTo(sourcePoint: Point, targetPoint: Point): void {
    this.source = sourcePoint.clone();
    const angle = Util.calculateAngle(sourcePoint.x, sourcePoint.y, targetPoint.x, targetPoint.y);
    this.target = new Point(
      sourcePoint.x + (LaserRay.laserLength * Math.cos(angle)),
      sourcePoint.y + (LaserRay.laserLength * Math.sin(angle)),
    );
  }

  override animate(): void {
    if (this.alpha <= 0) {
      return;
    }
    this.alpha -= 0.015 * Game.currentFrameMultiplier;
    const hitDamage = this.damagePerHit * Game.currentFrameMultiplier * this.alpha;
    for (const monster of Game.currentFrameMonsters) {
      if (Util.isWithinDistanceToSegment(this.source.x, this.source.y, this.target.x, this.target.y, monster.x, monster.y, monster.radius)) {
        monster.takeDamage(hitDamage);
      }
    }
  }

  override render(context: CanvasRenderingContext2D): void {
    if (this.alpha <= 0) {
      return;
    }
    context.save();
    context.globalAlpha = Math.max(0, this.alpha);
    context.strokeStyle = "#00ff00";
    context.lineWidth = this.strokeThickness;
    context.beginPath();
    context.moveTo(this.source.x, this.source.y);
    context.lineTo(this.target.x, this.target.y);
    context.stroke();
    context.restore();
  }
}
