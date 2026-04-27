import { Point } from "../Point";
import { Sprite } from "../Sprite";
import { Game } from "../Game";
import { Util } from "../Util";

export abstract class Monster extends Sprite {
  protected life = 0;
  protected originalLife = 0;
  private static readonly size = 16;
  private static readonly halfSize = Monster.size / 2;
  private readonly path: Point[];
  private readonly maxSpeed: number;
  private speed: number;
  private damageIndicatorChanged = false;
  protected angle = 0;
  private xsign = 0;
  private ysign = 0;
  private currentDest: Point;
  protected damageAlpha = 0;

  protected constructor(x: number, y: number, travelPath: Point[], initialSpeed: number) {
    super();
    this.speed = this.maxSpeed = initialSpeed;
    this.path = travelPath.slice(2).map((point) => point.clone());
    this.x = x;
    this.y = y;
    this.currentDest = (travelPath[1] ?? travelPath[0]).clone();
    this.changeDirection(this.currentDest);
  }

  bounty = 0;
  color = "#fff";

  takeDamage(damage: number): void {
    this.life -= damage;
    if (this.life < 0) {
      this.life = 0;
    }
    if (this.damageAlpha === 0) {
      this.damageIndicatorChanged = true;
    }
    this.damageAlpha = 1;
  }

  slowDown(d: number): void {
    this.speed = this.maxSpeed * d;
  }

  override render(context: CanvasRenderingContext2D): void {
    const x = Math.round(this.x - Monster.halfSize);
    const length = Monster.size * this.life / this.originalLife;
    context.save();
    context.strokeStyle = "#008000";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, Math.round(this.y - Monster.halfSize - 4));
    context.lineTo(Math.round(x + length), Math.round(this.y - Monster.halfSize - 4));
    context.stroke();
    context.restore();
  }

  override animate(): void {
    if (this.speed < this.maxSpeed) {
      this.speed += 0.01 * Game.currentFrameMultiplier;
      if (this.speed > this.maxSpeed) {
        this.speed = this.maxSpeed;
      }
      const velocity = Util.calculateLocation(this.angle, this.speed);
      this.dx = velocity.x;
      this.dy = velocity.y;
    }

    this.updatePosition();

    if (this.isOutsideBounds) {
      this.markedForRemoval = true;
      return;
    }

    if (this.life <= 0) {
      Game.killMonster(this);
      return;
    }

    const signChanged = Math.sign(this.currentDest.x - this.x) !== this.xsign || Math.sign(this.currentDest.y - this.y) !== this.ysign;
    if (signChanged) {
      if (this.path.length !== 0) {
        this.y = this.currentDest.y;
        this.x = this.currentDest.x;
        this.currentDest = this.path[0];
        this.path.splice(0, 1);
        this.changeDirection(this.currentDest);
      } else {
        Game.escapeMonster(this);
        return;
      }
    }

    if (this.damageAlpha > 0) {
      this.damageAlpha -= 0.03 * Game.currentFrameMultiplier;
      if (this.damageAlpha <= 0) {
        this.damageAlpha = 0;
        this.damageIndicatorChanged = true;
      }
    }

    this.damageIndicatorChanged = false;
  }

  protected angleChanged(newAngle: number): void {}

  private changeDirection(dest: Point): void {
    this.xsign = Math.sign(dest.x - this.x);
    this.ysign = Math.sign(dest.y - this.y);
    this.angle = Util.calculateAngle(this.x, this.y, dest.x, dest.y);
    this.angleChanged(this.angle);
    const velocity = Util.calculateLocation(this.angle, this.speed);
    this.dx = velocity.x;
    this.dy = velocity.y;
  }
}
