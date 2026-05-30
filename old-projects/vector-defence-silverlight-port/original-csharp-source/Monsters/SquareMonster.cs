using System.Collections.Generic;
using System.Windows;
using System.Windows.Media;
using System.Windows.Shapes;

namespace VectorDefenceSL.Monsters
{
    public class SquareMonster : Monster
    {
        private const int DIAMETER = 13;
        private readonly RotateTransform rotateTransform;
        private double rotationAngle = Util.Rand.Next(0, 360);

        public SquareMonster(double x, double y, IList<Point> path) : base(x, y, path, 1.25)
        {
            Bounty = 25;
            Color = Colors.Red;
            Radius = DIAMETER / 2;
            life = originalLife = 150;
            mainElement = new Rectangle
            {
                StrokeThickness = 1.5,
                Fill = new SolidColorBrush(Colors.Black),
                Stroke = new SolidColorBrush(Color),
                Width = DIAMETER,
                Height = DIAMETER,
            };
            rotateTransform = new RotateTransform { CenterX = Radius, CenterY = Radius };
            mainElement.RenderTransform = rotateTransform;
            Game.AddElement(mainElement);
        }

        public override void Animate()
        {
            rotationAngle += 4 * Game.CurrentFrameMultiplier;
            if (rotationAngle > 360)
            {
                rotationAngle = rotationAngle - 360;
            }
            base.Animate();
        }

        public override void Render()
        {
            rotateTransform.Angle = rotationAngle;
            Move(X - Radius, Y - Radius);
            base.Render();
        }
    }
}
