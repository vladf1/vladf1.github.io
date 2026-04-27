import { Point } from "../Point";
import { Monster } from "./Monster";

export class BallMonster extends Monster {
  private static readonly diameter = 15;

  constructor(x: number, y: number, path: Point[]) {
    super(x, y, path, 1.5);
    this.bounty = 20;
    this.color = "#00ffff";
    this.radius = BallMonster.diameter / 2;
    this.life = this.originalLife = 200;
  }

  override render(context: CanvasRenderingContext2D): void {
    context.save();
    context.globalAlpha = 1;
    context.fillStyle = this.damageAlpha > 0 ? `rgba(128,0,128,${this.damageAlpha})` : "#000";
    context.strokeStyle = this.color;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
    super.render(context);
  }
}
