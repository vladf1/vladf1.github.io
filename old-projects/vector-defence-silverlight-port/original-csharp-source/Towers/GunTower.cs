using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using VectorDefenceSL.Monsters;
using VectorDefenceSL.Particles;

namespace VectorDefenceSL.Towers
{
    public class GunTower : Tower
    {
        private const double GunLength = 16;

        private readonly Line gunLine = new Line
        {
            Stroke = new SolidColorBrush(Colors.White),
            StrokeThickness = 2,
            StrokeStartLineCap = PenLineCap.Round,
            StrokeEndLineCap = PenLineCap.Flat,
        };

        private readonly Ellipse torrentEllipse = new Ellipse
        {
            StrokeThickness = 1.5,
            Fill = new RadialGradientBrush(Colors.White, Colors.Black),
            Stroke = new SolidColorBrush(Colors.White),
            Width = TowerRadius * 2,
            Height = TowerRadius * 2
        };

        private Monster trackedMonster;
        private double gunAngle;

        public GunTower(Button btn) : base(btn, TowerBuildingMode.GunTower)
        {
        }

        public GunTower(double x, double y) : base(x, y)
        {
            Cost = 20;
            Range = 60;
            MillisecondsBetweenFiring = 200;
            torrentEllipse.MouseLeftButtonDown += HandleTowerSelection;
            gunLine.MouseLeftButtonDown += HandleTowerSelection;
        }

        public override void RemoveTowerFromCanvas()
        {
            base.RemoveTowerFromCanvas();
            Container.Children.Remove(torrentEllipse);
            Container.Children.Remove(gunLine);
        }

        public override sealed void Render()
        {
            gunLine.X1 = X;
            gunLine.Y1 = Y;
            gunAngle = Util.RandomInRange(-Math.PI, Math.PI);
            TurnGun();

            torrentEllipse.SetCanvasPosition(X - TowerRadius, Y - TowerRadius);
            Container.Children.Add(torrentEllipse);
            Container.Children.Add(gunLine);
        }

        protected override void Animate()
        {
            if (trackedMonster == null || trackedMonster.MarkedForRemoval)
            {
                trackedMonster = GetClosestMonsterInRange();
            }

            if (trackedMonster != null)
            {
                bool closeEnough = Util.IsWithinDistance(trackedMonster.X, trackedMonster.Y, X, Y, Range);
                if (!closeEnough || trackedMonster.MarkedForRemoval)
                {
                    trackedMonster = null;
                }
                else
                {
                    var source = new Point(gunLine.X2, gunLine.Y2);
                    var target = CalculateWhereToShoot(source, trackedMonster, Projectile.Speed);
                    gunAngle = Util.CalculateAngle(X, Y, target.X, target.Y);
                    TurnGun();

                    if (CanFireNow)
                    {
                        double damageCaused = 10d + Level;
                        double size = 3d + (Level / 2d);
                        new Projectile(source, target, damageCaused, size);
                        TimeFiring();
                    }
                }
            }
        }

        protected override void AnimateToolboxRendering()
        {
            gunAngle += ToolbarAnimationRotationStep * Game.CurrentFrameMultiplier;
            TurnGun();
        }

        protected override void UpgradeWork(int newLevel)
        {
            base.UpgradeWork(newLevel);
            gunLine.StrokeThickness = 2 + (newLevel / 2d);
            gunLine.Visibility = Visibility.Collapsed;
            gunLine.Visibility = Visibility.Visible;
        }

        private void TurnGun()
        {
            var dx = GunLength * Math.Cos(gunAngle);
            var dy = GunLength * Math.Sin(gunAngle);
            gunLine.X2 = X + dx;
            gunLine.Y2 = Y + dy;
        }
    }
}
