export abstract class BaseSprite {
  protected x = 0;
  protected y = 0;
  protected dx = 0;
  protected dy = 0;
  protected oldx = 0;
  protected oldy = 0;

  public abstract Animate(height: number, width: number, multiplier: number): boolean;

  public abstract RenderShapes(context: CanvasRenderingContext2D): void;

  protected UpdatePosition(multiplier: number): void {
    const ndy = this.dy * multiplier;
    const ndx = this.dx * multiplier;
    this.y += ndy;
    this.x += ndx;
  }
}
