export class CanvasButton {
  enabled = true;
  visible = true;
  showLabel = true;

  constructor(
    public x: number,
    public y: number,
    public width: number,
    public height: number,
    public label: string,
    public action: () => void,
  ) {}

  contains(x: number, y: number): boolean {
    return this.visible && this.enabled && x >= this.x && x <= this.x + this.width && y >= this.y && y <= this.y + this.height;
  }

  render(context: CanvasRenderingContext2D, hovered = false, pressed = false, opacity = 1): void {
    if (!this.visible) {
      return;
    }
    context.save();
    context.globalAlpha = (this.enabled ? 1 : 0.4) * opacity;
    context.fillStyle = pressed ? "#ffa500" : "#000";
    context.strokeStyle = pressed ? "#008000" : hovered ? "#ff0000" : "#008000";
    context.lineWidth = 2.5;
    if (hovered || pressed) {
      context.shadowBlur = 20;
      context.shadowColor = pressed ? "#ffa500" : "#ff0000";
    }
    context.beginPath();
    this.roundRect(context, this.x, this.y, this.width, this.height, 10);
    context.fill();
    context.stroke();
    if (this.showLabel) {
      context.shadowBlur = 0;
      context.fillStyle = "#ffff00";
      context.font = "25px Arial, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(this.label, this.x + (this.width / 2), this.y + (this.height / 2));
    }
    context.restore();
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
