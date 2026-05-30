using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Media;
using System.Windows.Shapes;

namespace VectorDefenceSL.Monsters
{
    public abstract class Monster : Sprite
    {
        protected double life;
        protected double originalLife;

        private const double Size = 16;
        private const double HalfSize = Size / 2;
        private readonly List<Point> path;
        private readonly Line line;
        private readonly double maxSpeed;
        private double speed;
        private bool damangeIndicatorChanged;
        private double angle;
        private int xsign;
        private int ysign;
        private Point currentDest;
        private double damangeAlpha;

        protected Monster(double x, double y, IList<Point> travelPath, double initialSpeed)
        {
            line = new Line { StrokeThickness = 2, Stroke = new SolidColorBrush(Colors.Green) };
            Game.AddElement(line);
            speed = maxSpeed = initialSpeed;
            path = new List<Point>(travelPath);
            X = x;
            Y = y;
            currentDest = travelPath[0];
            ChangeDirection(currentDest);
        }

        public int Bounty { get; protected set; }

        public Color Color { get; protected set;  }

        public override void RemoveFromCanvas()
        {
            base.RemoveFromCanvas();
            Game.Children.Remove(line);
        }

        public void TakeDamage(double damage)
        {
            life -= damage;
            if (life < 0)
            {
                life = 0;
            }

            if (damangeAlpha == 0)
            {
                damangeIndicatorChanged = true;
            }
            damangeAlpha = 1;
        }

        public void SlowDown(double d)
        {
            speed = maxSpeed * d;
        }

        public override void Render()
        {
            double x = X - HalfSize;
            line.X1 = Math.Round(x);
            var length = Size * life / originalLife;
            line.X2 = Math.Round(x + length);
            line.Y1 = line.Y2 = Math.Round(Y - HalfSize - 4);

            if (damangeAlpha != 0)
            {
                mainElement.Fill.Opacity = damangeAlpha;
            }
        }

        public override void Animate()
        {
            if (speed < maxSpeed)
            {
                speed += .01 * Game.CurrentFrameMultiplier;
                if (speed > maxSpeed)
                {
                    speed = maxSpeed;
                }
                Util.CalculateLocation(angle, speed, out DX, out DY); // update dx and dy vectors
            }

            UpdatePosition();

            if (IsOutsideBounds)
            {
                MarkedForRemoval = true;
                return;
            }

            if (life <= 0)
            {
                Game.KillMonster(this);
                return;
            }

            bool signChanged = Math.Sign(currentDest.X - X) != xsign || Math.Sign(currentDest.Y - Y) != ysign;
            if (signChanged)
            {
                if (path.Count != 0)
                {
                    Y = currentDest.Y;
                    X = currentDest.X;

                    currentDest = path[0];
                    path.RemoveAt(0);
                    ChangeDirection(currentDest);
                }
                else
                {
                    Game.EscapeMonster(this);
                    return;
                }
            }

            if (damangeAlpha > 0)
            {
                damangeAlpha -= .03 * Game.CurrentFrameMultiplier;
                if (damangeAlpha <= 0)
                {
                    damangeAlpha = 0;
                    damangeIndicatorChanged = true;
                }
            }
            
            if (damangeIndicatorChanged)
            {
                mainElement.Fill = damangeAlpha == 0 ? new SolidColorBrush(Colors.Black) : new SolidColorBrush(Colors.Purple);
            }

            damangeIndicatorChanged = false;
        }

        protected virtual void AngleChanged(double newAngle)
        {
        }

        private void ChangeDirection(Point dest)
        {
            xsign = Math.Sign(dest.X - X);
            ysign = Math.Sign(dest.Y - Y);
            angle = Util.CalculateAngle(X, Y, dest.X, dest.Y);
            AngleChanged(angle);
            Util.CalculateLocation(angle, speed, out DX, out DY);
        }
    }
}
