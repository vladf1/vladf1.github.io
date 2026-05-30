export class Point {
  constructor(
    public x: number,
    public y: number,
  ) {}

  clone(): Point {
    return new Point(this.x, this.y);
  }
}
