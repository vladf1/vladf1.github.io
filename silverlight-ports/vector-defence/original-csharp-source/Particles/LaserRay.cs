using System;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using VectorDefenceSL.Monsters;

namespace VectorDefenceSL.Particles
{
    public class LaserRay : Sprite
    {
        private const int LaserLenght = 1000;
        private readonly Line line = new Line { Stroke = new SolidColorBrush(Color.FromArgb(255, 0, 255, 0)), IsHitTestVisible = false };

        private Point source;
        private Point target;
        private double damagePerHit;

        public LaserRay()
        {
            mainElement = line;
            Canvas.SetZIndex(line, 10);
            Game.AddElement(line);
            SetLevel(0);
        }

        public bool IsOn
        {
            get { return alpha > 0; }
        }

        public void SetLevel(int level)
        {
            damagePerHit = 1 + (level / 4);
            line.StrokeThickness = 1.5 + (level / 3d);
        }

        public void FireAt(Point sourcePoint, Point targetPoint)
        {
            alpha = 1;
            line.Visibility = Visibility.Visible;
            TurnTo(sourcePoint, targetPoint);
        }

        public void TurnTo(Point sourcePoint, Point targetPoint)
        {
            source = sourcePoint;

            var angle = Util.CalculateAngle(source.X, source.Y, targetPoint.X, targetPoint.Y);

            target.X = sourcePoint.X + (LaserLenght * Math.Cos(angle));
            target.Y = sourcePoint.Y + (LaserLenght * Math.Sin(angle));

            line.X1 = source.X;
            line.Y1 = source.Y;
            line.X2 = target.X;
            line.Y2 = target.Y;
        }

        public override void Animate()
        {
            if (alpha <= 0)
            {
                line.Visibility = Visibility.Collapsed;
            }
            else
            {
                alpha -= .015 * Game.CurrentFrameMultiplier; // alpha channel
                
                var monstersHit = Game.CurrentFrameMonsters.Where(m => Util.IsWithinDistanceToSegment(source.X, source.Y, target.X, target.Y, m.X, m.Y, m.Radius)).ToArray();
                if (monstersHit.Length != 0)
                {
                    double hitDamage = damagePerHit * Game.CurrentFrameMultiplier * alpha;
                    foreach (Monster m in monstersHit)
                    {
                        m.TakeDamage(hitDamage);
                    }
                }
            }
        }

        public override void Render()
        {
            mainElement.Opacity = alpha;
        }
    }
}