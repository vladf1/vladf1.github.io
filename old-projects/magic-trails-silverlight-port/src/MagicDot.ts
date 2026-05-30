type EllipseData = {
  radius: number;
  opacity: number;
  fill: string;
};

export class MagicDot {
  private static readonly ELLIPSE_COUNT = 5;
  private static readonly OPACITY = 0.6;
  private static readonly OPACITY_INC = -0.15;

  public FireworkOpacityInc = -0.02;
  public XVelocity = 1;
  public YVelocity = 1;
  public Gravity = 1;
  public Opacity = 1;
  public X = 0;
  public Y = 0;

  private readonly ellipses: EllipseData[] = [];

  public constructor(red: number, green: number, blue: number, size: number) {
    let opac = MagicDot.OPACITY;
    let ellipseSize = size;

    for (let i = 0; i < MagicDot.ELLIPSE_COUNT; i++) {
      if (i === 0) {
        this.ellipses.push({
          radius: ellipseSize / 2,
          opacity: 1,
          fill: "rgb(255, 255, 255)",
        });
      } else {
        this.ellipses.push({
          radius: ellipseSize / 2,
          opacity: opac,
          fill: `rgb(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)})`,
        });
        opac += MagicDot.OPACITY_INC;
        ellipseSize += ellipseSize;
      }
    }
  }

  public RunFirework(): void {
    this.Opacity += this.FireworkOpacityInc;

    this.YVelocity += this.Gravity;
    this.X = this.X + this.XVelocity;
    this.Y = this.Y + this.YVelocity;
  }

  public Render(context: CanvasRenderingContext2D): void {
    context.save();
    context.globalAlpha = this.Opacity;
    for (const ellipse of this.ellipses) {
      context.globalAlpha = Math.max(0, this.Opacity * ellipse.opacity);
      context.fillStyle = ellipse.fill;
      context.beginPath();
      context.arc(this.X, this.Y, ellipse.radius, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }
}
