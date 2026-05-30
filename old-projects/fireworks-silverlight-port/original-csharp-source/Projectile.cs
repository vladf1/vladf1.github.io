using System;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;

namespace Fireworks_Silverlight
{
    public class Projectile : BaseSprite
    {
        public static Action<double, double> ExplosionFunc;

        private const int RADIUS = 5, SPEED = 7;
        private static readonly Line line = new Line { StrokeThickness = RADIUS * 2, StrokeEndLineCap = PenLineCap.Round, StrokeStartLineCap = PenLineCap.Round, Stroke = new SolidColorBrush(Colors.White) };
        private readonly double targetY;

        public Projectile(double w, double h)
        {
            x = oldx = Util.RandomInRange(w * .4, w * .6);
            y = oldy = h;
            targetY = Util.RandomInRange(h * .1, h * .7);
            var targetX = Util.RandomInRange(w * .1, w * .9);
            var angle = Math.Atan2(targetY - y, targetX - x);
            dx = SPEED * Math.Cos(angle);
            dy = SPEED * Math.Sin(angle);
        }

        public override bool Animate(double height, double width, double multiplier)
        {
            // var gravChange = .03 * multiplier;
            // dy += gravChange; 
            
            UpdatePosition(multiplier);

            if (y <= targetY) //  || y > height || x < 0 || x > width)
            {
                ExplosionFunc(x, y);
                return true;
            }

            return false;
        }

        public override void Render(WriteableBitmap bmp, int h, int w, int[] pixels)
        {
            FillEllipseCentered(bmp, (int)Math.Round(x), (int)Math.Round(y), RADIUS, RADIUS, -1); // -1 == white
            oldx = x;
            oldy = y;
        }

        public override void Render(WriteableBitmap bmp)
        {
            line.X1 = oldx;
            line.Y1 = oldy;
            line.X2 = x;
            line.Y2 = y;

            bmp.Render(line, null);

            oldx = x;
            oldy = y;
        }



        /// <summary>
        /// A Fast Bresenham Type Algorithm For Drawing filled ellipses http://homepage.smc.edu/kennedy_john/belipse.pdf 
        /// Uses a different parameter representation than DrawEllipse().
        /// </summary>
        /// <param name="bmp">The WriteableBitmap.</param>
        /// <param name="xc">The x-coordinate of the ellipses center.</param>
        /// <param name="yc">The y-coordinate of the ellipses center.</param>
        /// <param name="xr">The radius of the ellipse in x-direction.</param>
        /// <param name="yr">The radius of the ellipse in y-direction.</param>
        /// <param name="color">The color for the line.</param>
        public static void FillEllipseCentered(WriteableBitmap bmp, int xc, int yc, int xr, int yr, int color)
        {
            // Use refs for faster access (really important!) speeds up a lot!
            int[] pixels = bmp.Pixels;
            int w = bmp.PixelWidth;
            int h = bmp.PixelHeight;

            // Init vars
            int uh, lh, uy, ly, lx, rx;
            int x = xr;
            int y = 0;
            int xrSqTwo = (xr * xr) << 1;
            int yrSqTwo = (yr * yr) << 1;
            int xChg = yr * yr * (1 - (xr << 1));
            int yChg = xr * xr;
            int err = 0;
            int xStopping = yrSqTwo * xr;
            int yStopping = 0;

            // Draw first set of points counter clockwise where tangent line slope > -1.
            while (xStopping >= yStopping)
            {
                // Draw 4 quadrant points at once
                uy = yc + y;                  // Upper half
                ly = yc - y;                  // Lower half
                if (uy < 0) uy = 0;          // Clip
                if (uy >= h) uy = h - 1;      // ...
                if (ly < 0) ly = 0;
                if (ly >= h) ly = h - 1;
                uh = uy * w;                  // Upper half
                lh = ly * w;                  // Lower half

                rx = xc + x;
                lx = xc - x;
                if (rx < 0) rx = 0;          // Clip
                if (rx >= w) rx = w - 1;      // ...
                if (lx < 0) lx = 0;
                if (lx >= w) lx = w - 1;

                // Draw line
                for (int i = lx; i <= rx; i++)
                {
                    pixels[i + uh] = color;      // Quadrant II to I (Actually two octants)
                    pixels[i + lh] = color;      // Quadrant III to IV
                }

                y++;
                yStopping += xrSqTwo;
                err += yChg;
                yChg += xrSqTwo;
                if ((xChg + (err << 1)) > 0)
                {
                    x--;
                    xStopping -= yrSqTwo;
                    err += xChg;
                    xChg += yrSqTwo;
                }
            }

            // ReInit vars
            x = 0;
            y = yr;
            uy = yc + y;                  // Upper half
            ly = yc - y;                  // Lower half
            if (uy < 0) uy = 0;          // Clip
            if (uy >= h) uy = h - 1;      // ...
            if (ly < 0) ly = 0;
            if (ly >= h) ly = h - 1;
            uh = uy * w;                  // Upper half
            lh = ly * w;                  // Lower half
            xChg = yr * yr;
            yChg = xr * xr * (1 - (yr << 1));
            err = 0;
            xStopping = 0;
            yStopping = xrSqTwo * yr;

            // Draw second set of points clockwise where tangent line slope < -1.
            while (xStopping <= yStopping)
            {
                // Draw 4 quadrant points at once
                rx = xc + x;
                lx = xc - x;
                if (rx < 0) rx = 0;          // Clip
                if (rx >= w) rx = w - 1;      // ...
                if (lx < 0) lx = 0;
                if (lx >= w) lx = w - 1;

                // Draw line
                for (int i = lx; i <= rx; i++)
                {
                    pixels[i + uh] = color;      // Quadrant II to I (Actually two octants)
                    pixels[i + lh] = color;      // Quadrant III to IV
                }

                x++;
                xStopping += yrSqTwo;
                err += xChg;
                xChg += yrSqTwo;
                if ((yChg + (err << 1)) > 0)
                {
                    y--;
                    uy = yc + y;                  // Upper half
                    ly = yc - y;                  // Lower half
                    if (uy < 0) uy = 0;          // Clip
                    if (uy >= h) uy = h - 1;      // ...
                    if (ly < 0) ly = 0;
                    if (ly >= h) ly = h - 1;
                    uh = uy * w;                  // Upper half
                    lh = ly * w;                  // Lower half
                    yStopping -= xrSqTwo;
                    err += yChg;
                    yChg += xrSqTwo;
                }
            }
        }


    }
}
