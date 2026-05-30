import { MagicDot } from "./MagicDot";

export class ColorfulFireworks {
  private static readonly FIREWORK_NUM = 2;
  private static readonly GRAVITY = 0.5;
  private static readonly X_VELOCITY = 5;
  private static readonly Y_VELOCITY = 5;
  private static readonly SIZE_MIN = 1;
  private static readonly SIZE_MAX = 3;
  private static readonly FPS = 24;

  private readonly LayoutRoot: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly fireworks: MagicDot[] = [];
  private timer = 0;

  public constructor() {
    this.LayoutRoot = document.createElement("canvas");
    this.LayoutRoot.id = "ColorfulFireworks";
    this.LayoutRoot.addEventListener("pointermove", this.ColorfulFireworks_MouseMove);
    window.addEventListener("resize", this.UserControl_SizeChanged);

    const context = this.LayoutRoot.getContext("2d");
    if (context === null) {
      throw new Error("2D canvas is unavailable.");
    }
    this.context = context;
    this.UserControl_SizeChanged();
  }

  public get Element(): HTMLCanvasElement {
    return this.LayoutRoot;
  }

  public Start(): void {
    window.clearInterval(this.timer);
    this.timer = window.setInterval(this.timer_Tick, 1000 / ColorfulFireworks.FPS);
  }

  private ColorfulFireworks_MouseMove = (e: PointerEvent): void => {
    const rect = this.LayoutRoot.getBoundingClientRect();
    const scaleX = this.LayoutRoot.width / rect.width;
    const scaleY = this.LayoutRoot.height / rect.height;
    this.addFirework((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
  };

  private timer_Tick = (): void => {
    this.moveFirework();
  };

  private UserControl_SizeChanged = (): void => {
    const width = Math.max(1, Math.floor(window.innerWidth));
    const height = Math.max(1, Math.floor(window.innerHeight));
    if (this.LayoutRoot.width === width && this.LayoutRoot.height === height) {
      return;
    }

    this.LayoutRoot.width = width;
    this.LayoutRoot.height = height;
  };

  private moveFirework(): void {
    this.context.clearRect(0, 0, this.LayoutRoot.width, this.LayoutRoot.height);

    for (let i = this.fireworks.length - 1; i >= 0; i--) {
      const dot = this.fireworks[i];
      dot.RunFirework();
      if (dot.Opacity <= 0.1) {
        this.fireworks.splice(i, 1);
      } else {
        dot.Render(this.context);
      }
    }
  }

  private addFirework(x: number, y: number): void {
    for (let i = 0; i < ColorfulFireworks.FIREWORK_NUM; i++) {
      const size =
        ColorfulFireworks.SIZE_MIN + (ColorfulFireworks.SIZE_MAX - ColorfulFireworks.SIZE_MIN) * Math.random();
      const red = 128 + 128 * Math.random();
      const green = 128 + 128 * Math.random();
      const blue = 128 + 128 * Math.random();

      const xVelocity = ColorfulFireworks.X_VELOCITY - 2 * ColorfulFireworks.X_VELOCITY * Math.random();
      const yVelocity = -ColorfulFireworks.Y_VELOCITY * Math.random();

      const dot = new MagicDot(red, green, blue, size);
      dot.X = x;
      dot.Y = y;
      dot.XVelocity = xVelocity;
      dot.YVelocity = yVelocity;
      dot.Gravity = ColorfulFireworks.GRAVITY;
      dot.RunFirework();
      this.fireworks.push(dot);
      dot.Render(this.context);
    }
  }
}
