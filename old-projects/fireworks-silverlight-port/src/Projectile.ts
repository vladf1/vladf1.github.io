import { BaseSprite } from "./BaseSprite";
import { Util } from "./Util";

export class Projectile extends BaseSprite {
  public static ExplosionFunc: ((x: number, y: number) => void) | null = null;

  private static readonly RADIUS = 5;
  private static readonly SPEED = 7;
  private readonly targetY: number;

  public constructor(w: number, h: number) {
    super();
    this.x = this.oldx = Util.RandomInRange(w * 0.4, w * 0.6);
    this.y = this.oldy = h;
    this.targetY = Util.RandomInRange(h * 0.1, h * 0.7);
    const targetX = Util.RandomInRange(w * 0.1, w * 0.9);
    const angle = Math.atan2(this.targetY - this.y, targetX - this.x);
    this.dx = Projectile.SPEED * Math.cos(angle);
    this.dy = Projectile.SPEED * Math.sin(angle);
  }

  public Animate(height: number, width: number, multiplier: number): boolean {
    this.UpdatePosition(multiplier);

    if (this.y <= this.targetY) {
      Projectile.ExplosionFunc?.(this.x, this.y);
      return true;
    }

    return false;
  }

  public RenderShapes(context: CanvasRenderingContext2D): void {
    context.strokeStyle = "white";
    context.lineWidth = Projectile.RADIUS * 2;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(this.oldx, this.oldy);
    context.lineTo(this.x, this.y);
    context.stroke();

    this.oldx = this.x;
    this.oldy = this.y;
  }
}
