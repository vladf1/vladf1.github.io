import { Point } from "../Point";
import { Monster } from "./Monster";

export class TriangleMonster extends Monster {
  constructor(x: number, y: number, path: Point[]) {
    super(x, y, path, 1.75);
    this.bounty = 30;
    this.color = "#ffa500";
    this.radius = 7;
    this.life = this.originalLife = 100;
  }

  override render(context: CanvasRenderingContext2D): void {
    context.save();
    context.translate(this.x, this.y);
    context.rotate(this.angle);
    context.fillStyle = this.damageAlpha > 0 ? `rgba(128,0,128,${this.damageAlpha})` : "#000";
    context.strokeStyle = this.color;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(-6, -6);
    context.lineTo(6, 0);
    context.lineTo(-6, 6);
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();
    super.render(context);
  }
}
