using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using VectorDefenceSL.Particles;

namespace VectorDefenceSL.Towers
{
    public class MissleTower : Tower
    {
        private readonly RotateTransform angleTransform = new RotateTransform { Angle = 45, CenterX = TowerRadius, CenterY = TowerRadius };
        private readonly Rectangle tower = new Rectangle
        {
            StrokeThickness = 1.5,
            Fill = new RadialGradientBrush(Colors.Yellow, Colors.Black),
            Stroke = new SolidColorBrush(Colors.White),
            Width = TowerRadius * 2,
            Height = TowerRadius * 2
        };

        private double rotationSpeed;
        private double missleDamage;

        public MissleTower(double x, double y) : base(x, y)
        {
            Cost = 50;
            Range = 150;
            tower.MouseLeftButtonDown += HandleTowerSelection;
            SetLevel();
        }

        public MissleTower(Button btn) : base(btn, TowerBuildingMode.MissleTower)
        {
        }

        public override sealed void Render()
        {
            tower.RenderTransform = angleTransform;
            tower.SetCanvasPosition(X - TowerRadius, Y - TowerRadius);
            Container.Children.Add(tower);
        }

        public override void RemoveTowerFromCanvas()
        {
            base.RemoveTowerFromCanvas();
            Container.Children.Remove(tower);
        }

        protected override void Animate()
        {
            angleTransform.Angle += rotationSpeed * Game.CurrentFrameMultiplier;
            var monster = GetClosestMonsterInRange();
            if (monster != null && CanFireNow)
            {
                var source = new Point(X, Y);
                int damageRadius = 60 + (5 * Level);
                double missleSpeed = 1.8 + (Level / 2d);
                new Missle(source, monster, missleDamage, damageRadius, missleSpeed);
                TimeFiring();
            }
        }

        protected override void AnimateToolboxRendering()
        {
            angleTransform.Angle += 2.1 * Game.CurrentFrameMultiplier;
        }

        protected override void UpgradeWork(int newLevel)
        {
            base.UpgradeWork(newLevel);
            SetLevel();
        }

        private void SetLevel()
        {
            MillisecondsBetweenFiring = 1000 * (2 - (.2 * Level));  // increase frequency
            rotationSpeed = .5 + (Level / 3d);
            missleDamage = 50 + (4 * Level);
        }
    }
}