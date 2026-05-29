import { Point } from "../Point";
import { Game } from "../Game";
import { Util } from "../Util";
import { Monster } from "./Monster";

export class SquareMonster extends Monster {
  private static readonly diameter = 13;
  private rotationAngle = Util.randomInRange(0, 360);

  constructor(x: number, y: number, path: Point[]) {
    super(x, y, path, 1.25);
    this.bounty = 25;
    this.color = "#ff0000";
    this.radius = SquareMonster.diameter / 2;
    this.life = this.originalLife = 150;
  }

  override animate(): void {
    this.rotationAngle += 4 * Game.currentFrameMultiplier;
    if (this.rotationAngle > 360) {
      this.rotationAngle -= 360;
    }
    super.animate();
  }

  override render(context: CanvasRenderingContext2D): void {
    context.save();
    context.translate(this.x, this.y);
    context.rotate(this.rotationAngle * Math.PI / 180);
    context.fillStyle = this.damageAlpha > 0 ? `rgba(128,0,128,${this.damageAlpha})` : "#000";
    context.strokeStyle = this.color;
    context.lineWidth = 1.5;
    context.fillRect(-this.radius, -this.radius, SquareMonster.diameter, SquareMonster.diameter);
    context.strokeRect(-this.radius, -this.radius, SquareMonster.diameter, SquareMonster.diameter);
    context.restore();
    super.render(context);
  }
}
