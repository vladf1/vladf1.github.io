using System.Windows;
using System.Windows.Media;
using System.Windows.Shapes;

namespace VectorDefenceSL.Particles
{
    public class Projectile : Sprite
    {
        public const double Speed = 7;
        
        private readonly double damage;
        private static readonly SolidColorBrush ProjectileFill = Util.GetColorFromHex("9FFFE4");

        public Projectile(Point source, Point dest, double damageCaused, double size)
        {
            damage = damageCaused;
            X = source.X;
            Y = source.Y;

            double angle = Util.CalculateAngle(X, Y, dest.X, dest.Y);
            Util.CalculateLocation(angle, Speed, out DX, out DY);

            mainElement = new Ellipse
            {
                Fill = ProjectileFill,
                Width = size,
                Height = size,
                IsHitTestVisible = false,
            };
            Radius = size / 2;
            Game.AddElement(mainElement);      
        }

        public override void Animate()
        {
            UpdatePosition();

            if (IsOutsideBounds)
            {
                MarkedForRemoval = true;
                return;
            }

            foreach (var m in Game.CurrentFrameMonsters)
            {
                bool closeEnough = Util.IsWithinDistance(m.X, m.Y, X, Y, m.Radius + Radius);
                if (closeEnough)
                {
                    m.TakeDamage(damage);
                    MarkedForRemoval = true; // projectile should be removed
                    return;
                }
            }
        }

        public override void Render()
        {
            Move(X - Radius, Y - Radius);
        }
    }
}
