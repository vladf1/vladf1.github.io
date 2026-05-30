export class GraphicUtils {
  private static readonly TWO_PI = Math.PI * 2;

  public static FadeScreen(pixels: Uint8ClampedArray, fadeAmount: number): void {
    const clampedFade = Math.max(0, Math.min(1, fadeAmount));
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] !== 0 || pixels[index + 1] !== 0 || pixels[index + 2] !== 0) {
        pixels[index] = clampedFade * pixels[index];
        pixels[index + 1] = clampedFade * pixels[index + 1];
        pixels[index + 2] = clampedFade * pixels[index + 2];
      }
      pixels[index + 3] = 255;
    }
  }

  public static ColorToInt(r: number, g: number, b: number): number {
    return (r << 16) | (g << 8) | b;
  }

  public static CalcDistance(x1: number, y1: number, x2: number, y2: number): number {
    const sum = Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2);
    return Math.sqrt(sum);
  }

  public static NormalizeAngle(angle: number): number {
    if (angle < 0 || angle > GraphicUtils.TWO_PI) {
      const normalAngle = Math.abs(GraphicUtils.TWO_PI - Math.abs(angle));
      return normalAngle;
    }
    return angle;
  }

  public static DifBetweenAngles(a1: number, a2: number): number {
    const dif = a1 - a2;
    if (dif > Math.PI) {
      return Math.PI - dif;
    }
    if (dif < -Math.PI) {
      return -Math.PI - dif;
    }

    return dif;
  }

  public static DrawLine(
    pixels: Uint8ClampedArray,
    w: number,
    h: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: number,
  ): void {
    let dx = x2 - x1;
    let dy = y2 - y1;

    let incx = 0;
    if (dx < 0) {
      dx = -dx;
      incx = -1;
    } else if (dx > 0) {
      incx = 1;
    }

    let incy = 0;
    if (dy < 0) {
      dy = -dy;
      incy = -1;
    } else if (dy > 0) {
      incy = 1;
    }

    let pdx: number;
    let pdy: number;
    let odx: number;
    let ody: number;
    let es: number;
    let el: number;
    if (dx > dy) {
      pdx = incx;
      pdy = 0;
      odx = incx;
      ody = incy;
      es = dy;
      el = dx;
    } else {
      pdx = 0;
      pdy = incy;
      odx = incx;
      ody = incy;
      es = dx;
      el = dy;
    }

    let x = x1;
    let y = y1;
    let error = el >> 1;
    GraphicUtils.SetPixel(pixels, w, h, x, y, color);

    for (let i = 0; i < el; i++) {
      error -= es;

      if (error < 0) {
        error += el;
        x += odx;
        y += ody;
      } else {
        x += pdx;
        y += pdy;
      }

      GraphicUtils.SetPixel(pixels, w, h, x, y, color);
    }
  }

  private static SetPixel(pixels: Uint8ClampedArray, w: number, h: number, x: number, y: number, color: number): void {
    if (y < h && y >= 0 && x < w && x >= 0) {
      const pixelIndex = (y * w + x) * 4;
      pixels[pixelIndex] = (color >> 16) & 255;
      pixels[pixelIndex + 1] = (color >> 8) & 255;
      pixels[pixelIndex + 2] = color & 255;
      pixels[pixelIndex + 3] = 255;
    }
  }
}
