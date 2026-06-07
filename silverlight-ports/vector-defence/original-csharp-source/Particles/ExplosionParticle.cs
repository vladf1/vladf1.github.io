using System;
using System.Windows.Media;
using System.Windows.Shapes;

namespace VectorDefenceSL.Particles
{
    public class ExplosionParticle : Sprite
    {
        private readonly double size;
        private readonly Brush fill;
        private readonly double burnDownSpeed;

        public ExplosionParticle(double x, double y, double particleSize, Color particleColor, double burnDownPerFrame, double speed, double offset)
        {
            burnDownSpeed = burnDownPerFrame;
            size = particleSize;
            
            var angle = Util.RandomInRange(-Math.PI, Math.PI);
            var cos = Math.Cos(angle);
            var sin = Math.Sin(angle);

            DX = speed * cos;
            DY = speed * sin;

            X = x + (offset * cos);
            Y = y + (offset * sin);

            fill = new SolidColorBrush(particleColor);
            mainElement = new Rectangle
            {
                Fill = fill,
                Width = size,
                Height = size,
                IsHitTestVisible = false,
            };
            Game.AddElement(mainElement);
        }

        public ExplosionParticle(double x, double y, double particleSize, Color particleColor, double burnDownPerFrame)
            : this(x, y, particleSize, particleColor, burnDownPerFrame, Util.RandomInRange(2, 7), Util.RandomInRange(4, 6))
        {
        }

        public override void Animate()
        {
            double slowDownFactor = 1 - (.04 * Game.CurrentFrameMultiplier);
            DX *= slowDownFactor;
            DY *= slowDownFactor;
            UpdatePosition();

            if (IsOutsideBounds)
            {
                MarkedForRemoval = true;
            }
            else
            {
                alpha -= burnDownSpeed * Game.CurrentFrameMultiplier; // alpha channel
                if (alpha <= 0)
                {
                    MarkedForRemoval = true;
                }
            }
        }

        public override void Render()
        {
            fill.Opacity = alpha;
            double x = X - (size / 2);
            double y = Y - (size / 2);
            Move(x, y);
        }
    }
}
