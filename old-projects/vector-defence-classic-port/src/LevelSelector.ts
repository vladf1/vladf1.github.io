import { CanvasButton } from "./ui/CanvasButton";
import { LevelInfo } from "./LevelInfo";
import { LevelManager } from "./LevelManager";

export class LevelSelector {
  readonly width = 400;
  readonly buttons: CanvasButton[] = [];
  visible = true;
  private opacity = 1;
  private fading = false;
  private levelToOpen: LevelInfo | null = null;

  constructor(private readonly handler: (level: LevelInfo) => void) {
    const x = (700 - this.width) / 2;
    let y = (520 - this.estimatedHeight) / 2 + 30;
    for (const level of LevelManager.levels) {
      this.buttons.push(new CanvasButton(x + 30, y, this.width - 60, 46, level.name, () => this.choose(level)));
      y += 61;
    }
  }

  get estimatedHeight(): number {
    return (61 * LevelManager.levels.length) + 45;
  }

  update(multiplier: number): void {
    if (!this.fading) {
      return;
    }
    this.opacity -= 0.03 * multiplier;
    if (this.opacity <= 0) {
      this.visible = false;
      this.fading = false;
      if (this.levelToOpen !== null) {
        this.handler(this.levelToOpen);
      }
    }
  }

  render(context: CanvasRenderingContext2D, mouseX: number, mouseY: number): void {
    if (!this.visible) {
      return;
    }
    const x = (700 - this.width) / 2;
    const y = (520 - this.estimatedHeight) / 2;
    context.save();
    context.globalAlpha = this.opacity;
    context.fillStyle = "#000";
    context.strokeStyle = "#4682b4";
    context.lineWidth = 2;
    context.beginPath();
    this.roundRect(context, x, y, this.width, this.estimatedHeight, 10);
    context.fill();
    context.stroke();
    for (const button of this.buttons) {
      button.render(context, button.contains(mouseX, mouseY));
    }
    context.restore();
  }

  handleClick(x: number, y: number): boolean {
    if (!this.visible || this.fading) {
      return false;
    }
    const button = this.buttons.find((candidate) => candidate.contains(x, y));
    if (button === undefined) {
      return true;
    }
    button.action();
    return true;
  }

  private choose(level: LevelInfo): void {
    this.levelToOpen = level;
    this.fading = true;
  }

  private roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
  }
}
