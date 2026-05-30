import { GraphicUtils } from "./GraphicUtils";

export class Sprite {
  private static readonly MIN_COLOR = 40;
  private static readonly MAX_VELOCITY = 6;
  private static readonly MAX_OFFSET_AMOUNT = 10;
  private static readonly TOO_FAR = 650;
  private static readonly MIN_DISTANCE = 200;
  private static readonly CHANGE_DIRECTION_FRAMES = 10;
  private static readonly MAX_RANDOM_ANGLE_CHANGE = 1.5;
  private static readonly MAX_CRAZINESS = 0.1;

  private static readonly whiteIntColor = GraphicUtils.ColorToInt(255, 255, 255);

  private x: number;
  private y: number;
  private oldX: number;
  private oldY: number;
  private readonly speed = Sprite.MAX_VELOCITY * Sprite.RandomInRange(0.4, 1);
  private readonly craziness = Sprite.RandomInRange(0, Sprite.MAX_CRAZINESS);
  private readonly offsetX = Sprite.RandomInRange(-Sprite.MAX_OFFSET_AMOUNT, Sprite.MAX_OFFSET_AMOUNT);
  private readonly offsetY = Sprite.RandomInRange(-Sprite.MAX_OFFSET_AMOUNT, Sprite.MAX_OFFSET_AMOUNT);
  private readonly gravityDistance = Sprite.MIN_DISTANCE * Sprite.RandomInRange(0.7, 1.4);
  private angle = Sprite.RandomInRange(0, Math.PI * 2);
  private dx = 0;
  private dy = 0;
  private dAngle = 0;
  private angleChangeTimeLeft = 0;
  private readonly normalColor: string;
  private readonly normalIntColor: number;

  public RepelMode = false;

  public constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.CalcVector();
    this.oldX = x;
    this.oldY = y;

    const r = Math.floor(Sprite.RandomInRange(Sprite.MIN_COLOR, 255));
    const g = Math.floor(Sprite.RandomInRange(Sprite.MIN_COLOR, 255));
    const b = Math.floor(Sprite.RandomInRange(Sprite.MIN_COLOR, 255));
    this.normalColor = `rgb(${r}, ${g}, ${b})`;
    this.normalIntColor = GraphicUtils.ColorToInt(r, g, b);
  }

  public CalcVector(): void {
    this.dx = this.speed * Math.cos(this.angle);
    this.dy = this.speed * Math.sin(this.angle);
  }

  public static RandomInRange(minVal: number, maxVal: number): number {
    return minVal + Math.random() * (maxVal - minVal);
  }

  public Animate(mouseX: number, mouseY: number, width: number, height: number, multiplier: number): void {
    if (mouseX > 0 && mouseY > 0) {
      const dist = GraphicUtils.CalcDistance(this.x, this.y, mouseX, mouseY);

      if (this.RepelMode && dist < Sprite.MIN_DISTANCE) {
        this.angleChangeTimeLeft = 0;
        this.angle = GraphicUtils.NormalizeAngle(Math.atan2(this.y - mouseY, this.x - mouseX));
        this.CalcVector();
      } else if (dist > this.gravityDistance && dist < Sprite.TOO_FAR) {
        this.angleChangeTimeLeft = 5;
        const newAngle = GraphicUtils.NormalizeAngle(Math.atan2(mouseY - this.y + this.offsetY, mouseX - this.x + this.offsetX));
        const dif = GraphicUtils.DifBetweenAngles(newAngle, this.angle);
        this.dAngle = dif / this.angleChangeTimeLeft;
      }
    }

    if (this.angleChangeTimeLeft <= 0 && Math.random() < this.craziness * multiplier) {
      const angleChange = Sprite.RandomInRange(-Sprite.MAX_RANDOM_ANGLE_CHANGE, Sprite.MAX_RANDOM_ANGLE_CHANGE);
      this.dAngle = angleChange / Sprite.CHANGE_DIRECTION_FRAMES;
      this.angleChangeTimeLeft = Sprite.CHANGE_DIRECTION_FRAMES;
    }

    if (this.angleChangeTimeLeft > 0) {
      this.angle += this.dAngle * multiplier;
      this.angle = GraphicUtils.NormalizeAngle(this.angle);
      this.CalcVector();
      this.angleChangeTimeLeft -= multiplier;
    }

    let cdy = this.dy * multiplier;
    let cdx = this.dx * multiplier;

    let bounced = false;
    if (this.y + cdy < 0) {
      this.y = 0;
      this.dy *= -1;
      bounced = true;
    } else if (this.y + cdy > height) {
      this.y = height;
      this.dy *= -1;
      bounced = true;
    }

    if (this.x + cdx < 0) {
      this.x = 0;
      this.dx *= -1;
      bounced = true;
    } else if (this.x + cdx > width) {
      this.x = width;
      this.dx *= -1;
      bounced = true;
    }

    if (bounced) {
      cdy = this.dy * multiplier;
      cdx = this.dx * multiplier;
      this.angle = GraphicUtils.NormalizeAngle(Math.atan2(cdy, cdx));
      this.angleChangeTimeLeft = 0;
    }

    this.y += cdy;
    this.x += cdx;
  }

  public SavePosition(): void {
    this.oldX = this.x;
    this.oldY = this.y;
  }

  public RenderShapes(context: CanvasRenderingContext2D): void {
    context.strokeStyle = this.RepelMode ? "white" : this.normalColor;
    context.beginPath();
    context.moveTo(this.oldX, this.oldY);
    context.lineTo(this.x, this.y);
    context.stroke();

    this.SavePosition();
  }

  public RenderPixels(height: number, width: number, pixels: Uint8ClampedArray): void {
    const ix = Math.trunc(this.x);
    const iy = Math.trunc(this.y);
    const ox = Math.trunc(this.oldX);
    const oy = Math.trunc(this.oldY);
    const color = this.RepelMode ? Sprite.whiteIntColor : this.normalIntColor;
    GraphicUtils.DrawLine(pixels, width, height, ix, iy, ox, oy, color);

    this.SavePosition();
  }
}
