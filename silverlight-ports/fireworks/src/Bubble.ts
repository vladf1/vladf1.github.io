import { BaseSprite } from "./BaseSprite";
import { Util } from "./Util";

export class Bubble extends BaseSprite {
  private static readonly MAX_VELOCITY = 7;
  private static readonly COLOR_RANGE = 20;

  private readonly r: number;
  private readonly g: number;
  private readonly b: number;
  private a = 255;

  public constructor(x: number, y: number, ir: number, ig: number, ib: number) {
    super();
    this.oldx = this.x = x;
    this.oldy = this.y = y;
    const speed = Bubble.MAX_VELOCITY * Util.RandomInRange(0.4, 1);
    const randomSpread = Util.RandomInRange(0, 1);
    const angle = Util.RandomInRange(-Math.PI + randomSpread, -randomSpread);
    this.dx = speed * Math.cos(angle);
    this.dy = speed * Math.sin(angle);
    this.r = ir + Util.RandNext(-Bubble.COLOR_RANGE, Bubble.COLOR_RANGE);
    this.g = ig + Util.RandNext(-Bubble.COLOR_RANGE, Bubble.COLOR_RANGE);
    this.b = ib + Util.RandNext(-Bubble.COLOR_RANGE, Bubble.COLOR_RANGE);
  }

  public Animate(height: number, width: number, multiplier: number): boolean {
    const gravChange = 0.06 * multiplier;
    this.dy += gravChange;
    const windSlowDown = 1 - 0.005 * multiplier;
    this.dx *= windSlowDown;

    this.UpdatePosition(multiplier);

    if (this.x < 0 || this.x > width || this.y > height) {
      return true;
    }

    this.a -= multiplier * 1.2;

    if (this.a <= 0) {
      return true;
    }
    return false;
  }

  public RenderShapes(context: CanvasRenderingContext2D): void {
    context.strokeStyle = `rgba(${this.clampColor(this.r)}, ${this.clampColor(this.b)}, ${this.clampColor(this.g)}, ${Math.max(0, this.a / 255)})`;
    context.lineWidth = 5;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(this.oldx, this.oldy);
    context.lineTo(this.x, this.y);
    context.stroke();

    this.oldx = this.x;
    this.oldy = this.y;
  }

  private clampColor(value: number): number {
    return Math.max(0, Math.min(255, Math.trunc(value)));
  }
}
