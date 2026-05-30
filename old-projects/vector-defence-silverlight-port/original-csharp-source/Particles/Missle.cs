using System.Windows;
using System.Windows.Media;
using System.Windows.Shapes;
using VectorDefenceSL.Monsters;

namespace VectorDefenceSL.Particles
{
    public class Missle : Sprite
    {
        private const double IntervalBetweenParticleGenerations = Game.TicksPerSecond * .02;
        private readonly RotateTransform rotateTransform = new RotateTransform();
        private readonly double damage;
        private readonly double effectedRadius;
        private Sprite trackedMonster;
        private double speed;
        private double angle;
        private long lastFired;

        public Missle(Point source, Sprite trackedSprite, double damageCaused, double damageRadius, double missleSpeed)
        {
            damage = damageCaused;
            trackedMonster = trackedSprite;
            effectedRadius = damageRadius;
            speed = missleSpeed;
            
            X = source.X;
            Y = source.Y;

            mainElement = new Line
            {
                X1 = -6,
                X2 = 6,
                Stroke = new SolidColorBrush(Colors.Yellow),
                StrokeStartLineCap = PenLineCap.Square,
                StrokeEndLineCap = PenLineCap.Triangle,
                StrokeThickness = 3,
                RenderTransform = rotateTransform,
                IsHitTestVisible = false,
            };

            angle = Util.CalculateAngle(X, Y, trackedMonster.X, trackedMonster.Y);
            rotateTransform.Angle = Util.GetAngleInDegrees(angle);

            Game.AddElement(mainElement);      
        }

        public override void Animate()
        {
            speed += .05 * Game.CurrentFrameMultiplier;
            Util.CalculateLocation(angle, speed, out DX, out DY);

            UpdatePosition();

            if (IsOutsideBounds)
            {
                trackedMonster = null;
                MarkedForRemoval = true;
                return;
            }

            if (trackedMonster == null || trackedMonster.MarkedForRemoval)
            {
                trackedMonster = null;
            }

            if (trackedMonster != null)
            {
                angle = Util.CalculateAngle(X, Y, trackedMonster.X, trackedMonster.Y);
                rotateTransform.Angle = Util.GetAngleInDegrees(angle);
            }
            
            if (Game.TicksNow - lastFired > IntervalBetweenParticleGenerations)
            {
                double x, y;
                Util.CalculateLocation(angle, -9, out x, out y);
                x = X + Util.RandomInRange(x - 3, x + 3);
                y = Y + Util.RandomInRange(y - 3, y + 3);
                new MissleTrail(x, y);
                lastFired = Game.TicksNow;
            }

            foreach (Monster m in Game.CurrentFrameMonsters)
            {
                bool closeEnough = Util.IsWithinDistance(m.X, m.Y, X, Y, m.Radius + 6);
                if (closeEnough)
                {
                    MarkedForRemoval = true; // missle should be removed
                    var interval = Util.CalculateIntervalToComplete(.5);
                    Game.CreateExplosionParticles(X, Y, 20, 3, Colors.Yellow, interval);
                    DamageMonstersCloseBy(effectedRadius);
                    break;
                }
            }
        }

        public override void Render()
        {
            Move(X, Y);
        }

        private void DamageMonstersCloseBy(double range)
        {
            foreach (Monster m in Game.CurrentFrameMonsters)
            {
                bool closeEnough = Util.IsWithinDistance(m.X, m.Y, X, Y, range);
                if (closeEnough)
                {
                    var distance = Util.CalculateDistance(m.X, m.Y, X, Y);
                    var ratio = (range - distance) / range;
                    var damangeCaused = damage * ratio;
                    m.TakeDamage(damangeCaused);                
                }
            }
        }
    }
}