using System;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Media.Imaging;

namespace Pretty_Swarm
{
    public class Sprite
    {
        const int MIN_COLOR = 40, MAX_VELOCITY = 6,
            MAX_OFFSET_AMOUNT = 10, TOO_FAR = 650, MIN_DISTANCE = 200, CHANGE_DIRECTION_FRAMES = 10;
        const double MAX_RANDOM_ANGLE_CHANGE = 1.5, MAX_CRAZINESS = .1;
        
        private static readonly Random rand = new Random();
        private static readonly Brush whiteBrush = new SolidColorBrush(Colors.White);
        private static readonly int whiteIntColor = GraphicUtils.ColorToInt(255, 255, 255);

        double x, y, oldX, oldY;
        double speed = MAX_VELOCITY * RandomInRange(.4, 1);
        double craziness = RandomInRange(0, MAX_CRAZINESS);
        double offsetX = RandomInRange(-MAX_OFFSET_AMOUNT, MAX_OFFSET_AMOUNT);
        double offsetY = RandomInRange(-MAX_OFFSET_AMOUNT, MAX_OFFSET_AMOUNT);
        double gravityDistance = MIN_DISTANCE * RandomInRange(.7, 1.4);
        double angle = RandomInRange(0, Math.PI * 2); // randomize direction:
        double dx, dy, dAngle;
        private double angleChangeTimeLeft;

        private readonly Brush colorBrush;
        private readonly Color normalColor;
        private readonly int normalIntColor;

        public bool RepelMode { get; set; }

        public Sprite(double x, double y)
        {
            this.x = x;
            this.y = y;
            CalcVector();
            SavePosition();
            int r = rand.Next(MIN_COLOR, 255);
            int g = rand.Next(MIN_COLOR, 255);
            int b = rand.Next(MIN_COLOR, 255);
            normalColor = Color.FromArgb(255, (byte)r, (byte)g, (byte)b);
            normalIntColor = GraphicUtils.ColorToInt(r, g, b);
            colorBrush = new SolidColorBrush(normalColor);
        }

        public void CalcVector () 
        {
            dx = speed * Math.Cos(angle);
            dy = speed * Math.Sin(angle);
        }

        public static double RandomInRange(double minVal, double maxVal)
        {
            return minVal + (rand.NextDouble() * (maxVal - minVal));
        }

        public void Animate(double mouseX, double mouseY, int width, int height, double multiplier) 
        {
            if (mouseX > 0 && mouseY > 0) 
            {
                var dist = GraphicUtils.CalcDistance(x, y, mouseX, mouseY);

                if (RepelMode && dist < MIN_DISTANCE) 
                { 
                    angleChangeTimeLeft = 0;
                    angle = GraphicUtils.NormalizeAngle(Math.Atan2(y - mouseY, x - mouseX));
                    CalcVector();
                }
                else  // attraction mode
                { 
                    if (dist > gravityDistance && dist < TOO_FAR) 
                    {
                        angleChangeTimeLeft = 5;
                        var newAngle = GraphicUtils.NormalizeAngle(Math.Atan2(mouseY - y + offsetY, mouseX - x + offsetX));
                        var dif = GraphicUtils.DifBetweenAngles(newAngle, angle);
                        dAngle = dif / angleChangeTimeLeft;
                    }
                }
            }

            
            if (angleChangeTimeLeft <= 0 && rand.NextDouble() < craziness * multiplier) 
            {
                var angleChange = RandomInRange(-MAX_RANDOM_ANGLE_CHANGE, MAX_RANDOM_ANGLE_CHANGE);
                dAngle = angleChange / CHANGE_DIRECTION_FRAMES;
                angleChangeTimeLeft = CHANGE_DIRECTION_FRAMES;
            }
            

            if (angleChangeTimeLeft > 0) 
            {
                angle += (dAngle * multiplier);
                angle = GraphicUtils.NormalizeAngle(angle);
                CalcVector();
                angleChangeTimeLeft -= multiplier;
            }

            var cdy = dy * multiplier;
            var cdx = dx * multiplier;

            var bounced = false;
            if (y + cdy < 0) 
            {
                y = 0;
                dy *= -1;
                bounced = true;
            }
            else if (y + cdy > height) 
            {
                y = height;
                dy *= -1;
                bounced = true;
            }

            if (x + cdx < 0) 
            {
                x = 0;
                dx *= -1;
                bounced = true;
            }
            else if (x + cdx > width) 
            {
                x = width;
                dx *= -1;
                bounced = true;
            }

            if (bounced) 
            {
                cdy = dy * multiplier;
                cdx = dx * multiplier;
                angle = GraphicUtils.NormalizeAngle(Math.Atan2(cdy, cdx));
                angleChangeTimeLeft = 0;
            }

            y += cdy; // move
            x += cdx;
        }

        public void SavePosition() 
        {
            oldX = x;
            oldY = y;
        }

        public void Render(WriteableBitmap bmp, Line line)
        {
            line.X1 = oldX;
            line.Y1 = oldY;
            line.X2 = x;
            line.Y2 = y;

            line.Stroke = RepelMode ? whiteBrush : colorBrush;
            bmp.Render(line, null);

            SavePosition();
        }

        public void Render(int h, int w, int[] pixels)
        {
            var ix = (int)x;
            var iy = (int)y;
            var ox = (int)oldX;
            var oy = (int)oldY;

            var col = RepelMode ? whiteIntColor : normalIntColor;
            GraphicUtils.DrawLine(pixels, w, h, ix, iy, ox, oy, col);

            SavePosition();
        }
    }
}
