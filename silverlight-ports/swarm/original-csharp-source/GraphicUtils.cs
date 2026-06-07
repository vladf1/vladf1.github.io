using System;

namespace Pretty_Swarm
{
    public static class GraphicUtils
    {
        private const int AlphaShift = 255 << 24;
        private const double TWO_PI = Math.PI * 2;

        public static void FadeScreen(int[] pixels, double fadeAmount)
        {
            var len = pixels.Length;
            for (int index = 0; index < len; index++)
            {
                int c = pixels[index];
                if (c != 0 && c != AlphaShift)
                {
                    var r = (byte)(c >> 16);
                    var g = (byte)(c >> 8);
                    var b = (byte)(c);
                    r = (byte)(fadeAmount * r);
                    g = (byte)(fadeAmount * g);
                    b = (byte)(fadeAmount * b);
                    var newColor = (r << 16) | (g << 8) | b;
                    pixels[index] = newColor;
                }
            }
        }

        public static int ColorToInt(int r, int g, int b)
        {
            return (r << 16) | (g << 8) | b;
        }

        public static double CalcDistance(double x1, double y1, double x2, double y2)
        {
            var sum = Math.Pow(x1 - x2, 2) + Math.Pow(y1 - y2, 2);
            return Math.Sqrt(sum);
        }

        public static double NormalizeAngle(double angle)
        {
            if (angle < 0 || angle > TWO_PI)
            {
                var normalAngle = Math.Abs(TWO_PI - Math.Abs(angle));
                return normalAngle;
            }
            return angle;
        }

        public static double DifBetweenAngles(double a1, double a2)
        {
            var dif = a1 - a2;
            if (dif > Math.PI)
            {
                return Math.PI - dif;
            }
            if (dif < -Math.PI)
            {
                return -Math.PI - dif;
            }

            return dif;
        }


        /// <summary>
        /// Draws a colored line by connecting two points using a DDA algorithm (Digital Differential Analyzer).
        /// </summary>
        /// <param name="x1">The x-coordinate of the start point.</param>
        /// <param name="y1">The y-coordinate of the start point.</param>
        /// <param name="x2">The x-coordinate of the end point.</param>
        /// <param name="y2">The y-coordinate of the end point.</param>
        /// <param name="color">The color for the line.</param>
        public static void DrawLine(int[] pixels, int w, int h, int x1, int y1, int x2, int y2, int color)
        {
            // Distance start and end point
            int dx = x2 - x1;
            int dy = y2 - y1;

            // Determine sign for direction x
            int incx = 0;
            if (dx < 0)
            {
                dx = -dx;
                incx = -1;
            }
            else if (dx > 0)
            {
                incx = 1;
            }

            // Determine sign for direction y
            int incy = 0;
            if (dy < 0)
            {
                dy = -dy;
                incy = -1;
            }
            else if (dy > 0)
            {
                incy = 1;
            }

            // Which gradient is larger
            int pdx, pdy, odx, ody, es, el;
            if (dx > dy)
            {
                pdx = incx;
                pdy = 0;
                odx = incx;
                ody = incy;
                es = dy;
                el = dx;
            }
            else
            {
                pdx = 0;
                pdy = incy;
                odx = incx;
                ody = incy;
                es = dx;
                el = dy;
            }

            // Init start
            int x = x1;
            int y = y1;
            int error = el >> 1;
            if (y < h && y >= 0 && x < w && x >= 0)
            {
                pixels[y * w + x] = color;
            }

            // Walk the line!
            for (int i = 0; i < el; i++)
            {
                // Update error term
                error -= es;

                // Decide which coord to use
                if (error < 0)
                {
                    error += el;
                    x += odx;
                    y += ody;
                }
                else
                {
                    x += pdx;
                    y += pdy;
                }

                // Set pixel
                if (y < h && y >= 0 && x < w && x >= 0)
                {
                    pixels[y * w + x] = color;
                }
            }
        }



    }
}
