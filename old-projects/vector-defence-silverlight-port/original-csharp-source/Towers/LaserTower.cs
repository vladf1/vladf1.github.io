using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using VectorDefenceSL.Monsters;
using VectorDefenceSL.Particles;

namespace VectorDefenceSL.Towers
{
    public class LaserTower : Tower
    {
        private readonly LaserRay ray = new LaserRay();
        private readonly RotateTransform transform = new RotateTransform();
        private readonly Polygon gunPolygon = new Polygon
        {
            IsHitTestVisible = false,
            StrokeThickness = 1.5,
            Stroke = new SolidColorBrush(Colors.White),
            Fill = new SolidColorBrush(Colors.Cyan),
            Points =
            {
                new Point(-10, 5),
                new Point(-2, 4),
                new Point(10, 0),
                new Point(-2, -4),
                new Point(-10, -5)
            }
        };

        private readonly Ellipse ellipse = new Ellipse
        {
            Width = 25,
            Height = 25,
            Fill = new SolidColorBrush(Colors.Black)
        };

        private Monster trackedMonster;
        private Point gunTip;
        private double gunAngle;

        public LaserTower(double x, double y) : base(x, y)
        {
            Cost = 30;
            Range = 100;
            MillisecondsBetweenFiring = 1500;
            gunPolygon.RenderTransform = transform;
            ellipse.MouseLeftButtonDown += HandleTowerSelection;
            Container.Children.Add(ellipse);
            Container.Children.Add(gunPolygon);
        }

        public LaserTower(Button btn) : base(btn, TowerBuildingMode.LaserTower)
        {
            gunPolygon.RenderTransform = transform;
            Container.Children.Add(gunPolygon);
        }

        public override void RemoveTowerFromCanvas()
        {
            base.RemoveTowerFromCanvas();
            Container.Children.Remove(ellipse);
            Container.Children.Remove(gunPolygon);
            ray.RemoveFromCanvas();
        }

        public override sealed void Render()
        {
            gunAngle = Util.RandomInRange(-Math.PI, Math.PI);
            TurnGun();
            gunPolygon.SetCanvasPosition(X, Y);
            ellipse.SetCanvasPosition(X - (ellipse.Width / 2), Y - (ellipse.Height / 2));
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
                    var sourcePoint = new Point(gunTip.X, gunTip.Y);
                    if (ray.IsOn)
                    {
                        Point target = TurnGunToTrackedMonster();
                        ray.TurnTo(sourcePoint, target);
                    }

                    if (CanFireNow)
                    {
                        Point target = TurnGunToTrackedMonster();
                        ray.FireAt(sourcePoint, target);
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
            ray.SetLevel(newLevel);
        }

        private Point TurnGunToTrackedMonster()
        {
            var target = new Point(trackedMonster.X, trackedMonster.Y);
            gunAngle = Util.CalculateAngle(X, Y, target.X, target.Y);
            TurnGun();
            return target;
        }

        private void TurnGun()
        {
            transform.Angle = Util.GetAngleInDegrees(gunAngle);
            gunTip.X = X + (9 * Math.Cos(gunAngle));
            gunTip.Y = Y + (9 * Math.Sin(gunAngle));
        }
    }
}