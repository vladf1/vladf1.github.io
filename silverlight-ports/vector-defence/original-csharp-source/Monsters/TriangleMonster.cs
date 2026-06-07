using System.Collections.Generic;
using System.Windows;
using System.Windows.Media;
using System.Windows.Shapes;

namespace VectorDefenceSL.Monsters
{
    public class TriangleMonster : Monster
    {
        private readonly RotateTransform transform = new RotateTransform();

        public TriangleMonster(double x, double y, IList<Point> path) : base(x, y, path, 1.75)
        {
            Bounty = 30;
            Color = Colors.Orange;
            Radius = 7;
            life = originalLife = 100;
            mainElement = new Polygon
            {
                StrokeThickness = 1.5,
                Fill = new SolidColorBrush(Colors.Black),
                Stroke = new SolidColorBrush(Color),
                RenderTransform = transform,
                Points = new PointCollection
                {
                    new Point(-6, -6),
                    new Point(6, 0),
                    new Point(-6, 6),
                },
            };
            Game.AddElement(mainElement);
        }

        public override void Render()
        {
            Move(X, Y);
            base.Render();
        }

        protected override void AngleChanged(double newAngle)
        {
            transform.Angle = Util.GetAngleInDegrees(newAngle);
        }
    }
}