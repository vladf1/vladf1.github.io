import { Point } from "../Point";
import { Sprite } from "../Sprite";
import { Game } from "../Game";
import { Util } from "../Util";

export class Projectile extends Sprite {
  static readonly speed = 7;
  private readonly damage: number;

  constructor(source: Point, dest: Point, damageCaused: number, size: number) {
    super();
    this.damage = damageCaused;
    this.x = source.x;
    this.y = source.y;
    const angle = Util.calculateAngle(this.x, this.y, dest.x, dest.y);
    const velocity = Util.calculateLocation(angle, Projectile.speed);
    this.dx = velocity.x;
    this.dy = velocity.y;
    this.radius = size / 2;
  }

  override animate(): void {
    this.updatePosition();
    if (this.isOutsideBounds) {
      this.markedForRemoval = true;
      return;
    }

    for (const monster of Game.currentFrameMonsters) {
      if (Util.isWithinDistance(monster.x, monster.y, this.x, this.y, monster.radius + this.radius)) {
        monster.takeDamage(this.damage);
        this.markedForRemoval = true;
        return;
      }
    }
  }

  override render(context: CanvasRenderingContext2D): void {
    context.save();
    context.fillStyle = "#9fffe4";
    context.beginPath();
    context.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}
