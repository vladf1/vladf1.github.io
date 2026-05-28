import { GraphicUtils } from "./GraphicUtils";
import { Sprite } from "./Sprite";

type InitParams = {
  NumberOfSprites?: string;
  RenderWithShapes?: string;
  FadeAmount?: string;
};

type RenderMode = "pixels" | "shapes";

export class MainPage {
  private static readonly DefaultNumberOfSprites = 2500;
  private static readonly DefaultRenderWithShapes = false;
  private static readonly DefaultFadeAmount = 0.1;
  private static readonly MillisecondsPerSecond = 1000;
  private static readonly BaseTicksPerFrame = MainPage.MillisecondsPerSecond / 60;

  private numberOfSprites: number;
  private renderMode: RenderMode;
  private fadeAmount: number;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly spritesText: HTMLDivElement;
  private readonly controls: HTMLDivElement;
  private readonly spriteInput: HTMLInputElement;
  private readonly fadeInput: HTMLInputElement;
  private readonly modeInputs: HTMLInputElement[];
  private lastAnimated = 0;
  private lastTimed = performance.now();
  private framesRendered = 0;
  private fps = 0;
  private sprites: Sprite[] | null = null;
  private height = 0;
  private width = 0;
  private bmp: ImageData | null = null;
  private mouseX = -1;
  private mouseY = -1;
  private animationFrame = 0;

  public constructor(root: HTMLElement, initParams: InitParams) {
    this.numberOfSprites = this.parseNumberOfSprites(initParams.NumberOfSprites);
    this.renderMode = this.parseRenderMode(initParams.RenderWithShapes);
    this.fadeAmount = this.parseFadeAmount(initParams.FadeAmount);

    root.className = "silverlight-root";
    const controls = this.createControls();
    this.controls = controls.controls;
    this.spriteInput = controls.spriteInput;
    this.fadeInput = controls.fadeInput;
    this.modeInputs = controls.modeInputs;

    this.canvas = document.createElement("canvas");
    this.canvas.id = "canvas";
    this.canvas.setAttribute("aria-label", "Pretty Swarm canvas");
    this.spritesText = document.createElement("div");
    this.spritesText.id = "spritesText";
    this.spritesText.textContent = "  ";
    root.append(this.canvas, this.spritesText, this.controls);

    const context = this.canvas.getContext("2d", { alpha: false });
    if (context === null) {
      throw new Error("2D canvas is unavailable.");
    }
    this.context = context;

    window.addEventListener("resize", this.UserControl_SizeChanged);
    this.canvas.addEventListener("pointermove", this.UserControl_MouseMove);
    this.canvas.addEventListener("pointerleave", this.UserControl_MouseLeave);
    this.canvas.addEventListener("pointerdown", this.UserControl_MouseLeftButtonDown);
    window.addEventListener("pointerup", this.UserControl_MouseLeftButtonUp);

    this.UserControl_SizeChanged();
    this.animationFrame = requestAnimationFrame(this.RenderFrame);
  }

  private RenderFrame = (): void => {
    if (this.bmp === null || this.sprites === null) {
      this.animationFrame = requestAnimationFrame(this.RenderFrame);
      return;
    }

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
    }
    this.lastAnimated = now;

    for (const s of this.sprites) {
      s.Animate(this.mouseX, this.mouseY, this.width, this.height, multiplier);
    }

    if (this.renderMode === "shapes") {
      this.FadeScreen(multiplier);
      this.context.lineWidth = 5;
      this.context.lineCap = "round";
      for (const s of this.sprites) {
        s.RenderShapes(this.context);
      }
    } else {
      const reduceAlpha = this.fadeAmount * multiplier;
      const fadeBy = 1 - reduceAlpha;
      GraphicUtils.FadeScreen(this.bmp.data, fadeBy);
      for (const s of this.sprites) {
        s.RenderPixels(this.height, this.width, this.bmp.data);
      }
      this.context.putImageData(this.bmp, 0, 0);
    }

    this.spritesText.textContent = `FPS: ${this.fps}, Sprites: ${this.numberOfSprites}, Mode: ${this.renderMode}`;
    this.framesRendered++;
    this.animationFrame = requestAnimationFrame(this.RenderFrame);
  };

  private FadeScreen(multiplier: number): void {
    const reduceAlpha = Math.max(0, Math.min(1, this.fadeAmount * multiplier));
    this.context.fillStyle = `rgba(0, 0, 0, ${reduceAlpha})`;
    this.context.fillRect(0, 0, this.width, this.height);
  }

  private UserControl_MouseLeftButtonDown = (e: PointerEvent): void => {
    this.UserControl_MouseMove(e);
    this.canvas.setPointerCapture(e.pointerId);
    if (this.sprites !== null) {
      for (const s of this.sprites) {
        s.RepelMode = true;
      }
    }
  };

  private UserControl_SizeChanged = (): void => {
    this.height = Math.max(1, Math.floor(window.innerHeight));
    this.width = Math.max(1, Math.floor(window.innerWidth));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.context.fillStyle = "black";
    this.context.fillRect(0, 0, this.width, this.height);
    this.bmp = this.context.createImageData(this.width, this.height);
    this.prepareBitmapAlpha();

    if (this.sprites === null) {
      this.sprites = [];
      for (let i = 0; i < this.numberOfSprites; i++) {
        const x = Math.floor(Sprite.RandomInRange(0, this.width));
        const y = Math.floor(Sprite.RandomInRange(0, this.height));
        this.sprites.push(new Sprite(x, y));
      }
    }
  };

  private UserControl_MouseMove = (e: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;
  };

  private UserControl_MouseLeave = (e: PointerEvent): void => {
    this.mouseY = -1;
    this.mouseX = -1;
    this.UserControl_MouseLeftButtonUp(e);
  };

  private UserControl_MouseLeftButtonUp = (e: PointerEvent | null): void => {
    if (e !== null && this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
    if (this.sprites !== null) {
      for (const s of this.sprites) {
        s.RepelMode = false;
      }
    }
  };

  private parseNumberOfSprites(value: string | undefined): number {
    const parsed = value === undefined ? NaN : Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : MainPage.DefaultNumberOfSprites;
  }

  private parseRenderWithShapes(value: string | undefined): boolean {
    if (value === undefined) {
      return MainPage.DefaultRenderWithShapes;
    }
    return value.toLowerCase() === "true";
  }

  private prepareBitmapAlpha(): void {
    if (this.bmp === null) {
      return;
    }
    const pixels = this.bmp.data;
    for (let i = 3; i < pixels.length; i += 4) {
      pixels[i] = 255;
    }
  }

  private createControls(): {
    controls: HTMLDivElement;
    spriteInput: HTMLInputElement;
    fadeInput: HTMLInputElement;
    modeInputs: HTMLInputElement[];
  } {
    const controls = document.createElement("div");
    controls.id = "swarmControls";

    const modeGroup = document.createElement("fieldset");
    const modeLegend = document.createElement("legend");
    modeLegend.textContent = "Render";
    modeGroup.append(modeLegend);

    const pixelInput = this.createModeInput("pixels", "Pixels");
    const shapeInput = this.createModeInput("shapes", "Shapes");
    modeGroup.append(pixelInput.label, shapeInput.label);

    const spriteLabel = document.createElement("label");
    spriteLabel.className = "control-field";
    const spriteText = document.createElement("span");
    spriteText.textContent = "Sprites";
    const spriteInput = document.createElement("input");
    spriteInput.type = "number";
    spriteInput.min = "10";
    spriteInput.max = "5000";
    spriteInput.step = "10";
    spriteInput.value = String(this.numberOfSprites);
    spriteInput.addEventListener("change", () => {
      this.setNumberOfSprites(spriteInput.value);
    });
    spriteLabel.append(spriteText, spriteInput);

    const fadeLabel = document.createElement("label");
    fadeLabel.className = "control-field";
    const fadeText = document.createElement("span");
    fadeText.textContent = "Trail fade";
    const fadeInput = document.createElement("input");
    fadeInput.type = "range";
    fadeInput.min = "0.02";
    fadeInput.max = "0.25";
    fadeInput.step = "0.01";
    fadeInput.value = String(this.fadeAmount);
    fadeInput.addEventListener("input", () => {
      this.setFadeAmount(fadeInput.value);
    });
    fadeLabel.append(fadeText, fadeInput);

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.textContent = "Reset";
    resetButton.addEventListener("click", () => {
      this.recreateSprites();
    });

    controls.append(modeGroup, spriteLabel, fadeLabel, resetButton);

    return {
      controls,
      spriteInput,
      fadeInput,
      modeInputs: [pixelInput.input, shapeInput.input],
    };
  }

  private createModeInput(value: RenderMode, labelText: string): { input: HTMLInputElement; label: HTMLLabelElement } {
    const label = document.createElement("label");
    label.className = "mode-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "renderMode";
    input.value = value;
    input.checked = this.renderMode === value;
    input.addEventListener("change", () => {
      if (input.checked) {
        this.setRenderMode(value);
      }
    });
    const text = document.createElement("span");
    text.textContent = labelText;
    label.append(input, text);
    return { input, label };
  }

  private setRenderMode(mode: RenderMode): void {
    if (this.renderMode === mode) {
      return;
    }
    this.renderMode = mode;
    this.modeInputs.forEach((input) => {
      input.checked = input.value === mode;
    });
    this.resetDrawingSurface();
    this.writeConfigToUrl();
  }

  private setNumberOfSprites(value: string): void {
    const parsed = this.parseNumberOfSprites(value);
    if (parsed === this.numberOfSprites) {
      this.spriteInput.value = String(this.numberOfSprites);
      return;
    }
    this.numberOfSprites = parsed;
    this.spriteInput.value = String(this.numberOfSprites);
    this.recreateSprites();
    this.writeConfigToUrl();
  }

  private setFadeAmount(value: string): void {
    this.fadeAmount = this.parseFadeAmount(value);
    this.fadeInput.value = String(this.fadeAmount);
    this.writeConfigToUrl();
  }

  private recreateSprites(): void {
    this.sprites = [];
    for (let i = 0; i < this.numberOfSprites; i++) {
      const x = Math.floor(Sprite.RandomInRange(0, this.width));
      const y = Math.floor(Sprite.RandomInRange(0, this.height));
      this.sprites.push(new Sprite(x, y));
    }
    this.resetDrawingSurface();
  }

  private resetDrawingSurface(): void {
    this.context.fillStyle = "black";
    this.context.fillRect(0, 0, this.width, this.height);
    this.bmp = this.context.createImageData(this.width, this.height);
    this.prepareBitmapAlpha();
    this.lastAnimated = 0;
    this.lastTimed = performance.now();
    this.framesRendered = 0;
    this.fps = 0;
  }

  private writeConfigToUrl(): void {
    const params = new URLSearchParams(window.location.search);
    params.set("NumberOfSprites", String(this.numberOfSprites));
    params.set("RenderWithShapes", String(this.renderMode === "shapes"));
    params.set("FadeAmount", String(this.fadeAmount));
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query === "" ? "" : `?${query}`}`;
    window.history.replaceState(null, "", nextUrl);
  }

  private parseRenderMode(value: string | undefined): RenderMode {
    return this.parseRenderWithShapes(value) ? "shapes" : "pixels";
  }

  private parseFadeAmount(value: string | undefined): number {
    const parsed = value === undefined ? NaN : Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
      return MainPage.DefaultFadeAmount;
    }
    return Math.max(0.02, Math.min(0.25, parsed));
  }
}
