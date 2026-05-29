import { BoardElement } from "./BoardElement";
import { Game } from "./Game";

export abstract class Sprite extends BoardElement {
  markedForRemoval = false;
  dx = 0;
  dy = 0;
  radius = 0;
  protected alpha = 1;

  protected constructor() {
    super();
    Game.sprites.push(this);
  }

  protected get isOutsideBounds(): boolean {
    return this.x < 0 || this.y < 0 || this.x > Game.canvasWidth || this.y > Game.canvasHeight;
  }

  abstract render(context: CanvasRenderingContext2D): void;

  abstract animate(): void;

  removeFromCanvas(): void {}

  protected updatePosition(): void {
    this.y += this.dy * Game.currentFrameMultiplier;
    this.x += this.dx * Game.currentFrameMultiplier;
  }
}
