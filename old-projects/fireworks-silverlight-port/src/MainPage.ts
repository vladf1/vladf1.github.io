import fireSoundUrl from "./fire-sound.mp3";
import { BaseSprite } from "./BaseSprite";
import { Bubble } from "./Bubble";
import { Projectile } from "./Projectile";
import { Util } from "./Util";

export class MainPage {
  private static readonly MIN_COLOR = 30;
  private static readonly COLOR_RANGE = 20;
  private static readonly MAX_COLOR = 255 - MainPage.COLOR_RANGE;
  private static readonly MillisecondsPerSecond = 1000;
  private static readonly BaseTicksPerFrame = MainPage.MillisecondsPerSecond / 60;

  private fireInterval = MainPage.MillisecondsPerSecond;
  private lastTimed = performance.now();
  private lastFired = 0;
  private lastAnimated = 0;
  private framesRendered = 0;
  private fps = 0;
  private readonly sprites: BaseSprite[] = [];
  private height = 0;
  private width = 0;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly spritesText: HTMLDivElement;
  private readonly soundCheckBox: HTMLInputElement;
  private readonly mediaElements: HTMLAudioElement[] = [];
  private animationFrame = 0;

  public constructor(root: HTMLElement) {
    root.className = "silverlight-root";
    this.canvas = document.createElement("canvas");
    this.canvas.id = "canvas";
    this.canvas.setAttribute("aria-label", "Fireworks canvas");

    this.spritesText = document.createElement("div");
    this.spritesText.id = "spritesText";
    this.spritesText.textContent = "FPS";

    const soundLabel = document.createElement("label");
    soundLabel.id = "soundControl";
    this.soundCheckBox = document.createElement("input");
    this.soundCheckBox.type = "checkbox";
    this.soundCheckBox.tabIndex = -1;
    const soundText = document.createElement("span");
    soundText.textContent = "Sound";
    soundLabel.append(this.soundCheckBox, soundText);

    root.append(this.canvas, this.spritesText, soundLabel);

    const context = this.canvas.getContext("2d", { alpha: false });
    if (context === null) {
      throw new Error("2D canvas is unavailable.");
    }
    this.context = context;

    Projectile.ExplosionFunc = this.OnProjectileExplosion;

    for (let i = 0; i < 5; i++) {
      this.mediaElements.push(new Audio(fireSoundUrl));
    }

    window.addEventListener("resize", this.UserControl_SizeChanged);
    this.canvas.addEventListener("pointerdown", this.UserControl_MouseLeftButtonDown);
    window.addEventListener("keydown", this.UserControl_KeyDown);

    this.UserControl_SizeChanged();
    this.animationFrame = requestAnimationFrame(this.RenderFrame);
  }

  private RenderFrame = (): void => {
    const now = performance.now();
    let multiplier = 0;
    if (this.lastAnimated !== 0) {
      const timeBetweenFrames = now - this.lastAnimated;
      multiplier = timeBetweenFrames / MainPage.BaseTicksPerFrame;

      if (now - this.lastTimed >= MainPage.MillisecondsPerSecond) {
        this.fps = this.framesRendered;
        this.framesRendered = 0;
        this.lastTimed = now;
      }

      if (now - this.lastFired >= this.fireInterval) {
        this.Fire(1);
        this.lastFired = now;
        this.fireInterval = MainPage.MillisecondsPerSecond * Util.RandomInRange(0.5, 2);
      }
    }
    this.lastAnimated = now;

    const copy = [...this.sprites];
    this.sprites.length = 0;
    for (const s of copy) {
      const removed = s.Animate(this.height, this.width, multiplier);
      if (!removed) {
        this.sprites.push(s);
      }
    }

    this.FadeScreen(multiplier);
    for (const s of this.sprites) {
      s.RenderShapes(this.context);
    }

    this.spritesText.textContent = `FPS: ${this.fps}, Sprites: ${this.sprites.length}`;

    this.framesRendered++;
    this.animationFrame = requestAnimationFrame(this.RenderFrame);
  };

  private Fire(count: number): void {
    for (let i = 0; i < count; i++) {
      this.sprites.push(new Projectile(this.width, this.height));
    }
  }

  private OnProjectileExplosion = (x: number, y: number): void => {
    if (this.soundCheckBox.checked) {
      for (const m of this.mediaElements) {
        if (m.paused || m.ended) {
          m.currentTime = 0;
          void m.play();
          break;
        }
      }
    }

    const count = Util.RandNext(10, 50);
    const r = Util.RandNext(MainPage.MIN_COLOR, MainPage.MAX_COLOR);
    const g = Util.RandNext(MainPage.MIN_COLOR, MainPage.MAX_COLOR);
    const b = Util.RandNext(MainPage.MIN_COLOR, MainPage.MAX_COLOR);
    for (let i = 0; i < count; i++) {
      const newBubble = new Bubble(x, y, r, g, b);
      this.sprites.push(newBubble);
    }
  };

  private UserControl_MouseLeftButtonDown = (): void => {
    this.Fire(1);
  };

  private UserControl_SizeChanged = (): void => {
    this.height = Math.max(1, Math.floor(window.innerHeight));
    this.width = Math.max(1, Math.floor(window.innerWidth));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.context.fillStyle = "black";
    this.context.fillRect(0, 0, this.width, this.height);
  };

  private UserControl_KeyDown = (e: KeyboardEvent): void => {
    if (e.code === "Space") {
      this.UserControl_MouseLeftButtonDown();
    }
  };

  private FadeScreen(multiplier: number): void {
    const reduceAlpha = Math.max(0, Math.min(1, 0.1 * multiplier));
    this.context.fillStyle = `rgba(0, 0, 0, ${reduceAlpha})`;
    this.context.fillRect(0, 0, this.width, this.height);
  }

}
