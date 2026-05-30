using System;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;

namespace Fireworks_Silverlight
{
    public class Bubble : BaseSprite
    {
        private const int MAX_VELOCITY = 7, COLOR_RANGE = 20;
        private static readonly MatrixTransform emptyTransform = new MatrixTransform();
        private readonly int r, g, b;
        private double a;
        private readonly Line line;

        public Bubble(double x, double y, int ir, int ig, int ib, bool lineMode)
        {
            oldx = this.x = x;
            oldy = this.y = y;
            var speed = MAX_VELOCITY * Util.RandomInRange(.4, 1);
            var randomSpread = Util.RandomInRange(0, 1);
            var angle = Util.RandomInRange(-Math.PI + randomSpread, -randomSpread); // randomize direction:
            dx = speed * Math.Cos(angle);
            dy = speed * Math.Sin(angle);
            r = ir + Util.Rand.Next(-COLOR_RANGE, COLOR_RANGE);
            g = ig + Util.Rand.Next(-COLOR_RANGE, COLOR_RANGE);
            b = ib + Util.Rand.Next(-COLOR_RANGE, COLOR_RANGE);
            a = 255;

            if (lineMode)
            {
                line = new Line
                {
                    StrokeThickness = 5,
                    StrokeEndLineCap = PenLineCap.Round,
                    StrokeStartLineCap = PenLineCap.Round,
                    Stroke = new SolidColorBrush(Color.FromArgb(255, (byte)r, (byte)b, (byte)g))
                };
            }
        }

        public override bool Animate(double height, double width, double multiplier)
        {
            var gravChange = .06 * multiplier;
            dy += gravChange;
            var windSlowDown = 1 - (.005 * multiplier);
            dx *= windSlowDown;

            UpdatePosition(multiplier);

            if (x < 0 || x > width || y > height) // moved outside the canvas
            {
                return true;
            }

            a -= multiplier * 1.2; // alpha channel

            if (a <= 0)
            {
                return true; // true if faded to black
            }
            return false;
        }

        public override void Render(WriteableBitmap bmp)
        {
            line.X1 = oldx;
            line.Y1 = oldy;
            line.X2 = x;
            line.Y2 = y;
            line.Stroke.Opacity = a / 255d;

            bmp.Render(line, emptyTransform);

            oldx = x;
            oldy = y;
        }

        public override void Render(WriteableBitmap bmp, int h, int w, int[] pixels)
        {
            var alpha = (byte)a + 1;
            var col = (alpha << 24)
                | ((byte)((r * alpha) >> 8) << 16)
                | ((byte)((g * alpha) >> 8) << 8)
                | ((byte)((b * alpha) >> 8));

            var ix = (int)x;
            var iy = (int)y;
            LinesOfPixels(pixels, ix - 1, ix + 2, iy - 2, col, h, w, 1);
            LinesOfPixels(pixels, ix - 2, ix + 3, iy - 1, col, h, w, 3);
            LinesOfPixels(pixels, ix - 1, ix + 2, iy + 2, col, h, w, 1);

            oldx = x;
            oldy = y;
        }

        private static void LinesOfPixels(int[] pixels, int x, int lastX, int y, int color, int height, int width, int rows)
        {
            for (var r = 0; r < rows; r++)
            {
                var offset = y * width;
                if (y >= 0 && y < height)
                {
                    for (var newX = x; newX < lastX; newX++)
                    {
                        if (newX >= 0 && newX < width)
                        {
                            pixels[offset + newX] = color;
                        }
                    }
                }
                y++;
            }
        }

    }
}
