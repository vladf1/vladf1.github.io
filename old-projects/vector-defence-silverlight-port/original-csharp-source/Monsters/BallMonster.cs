using System.Collections.Generic;
using System.Windows;
using System.Windows.Media;
using System.Windows.Shapes;

namespace VectorDefenceSL.Monsters
{
    public class BallMonster : Monster
    {
        private const int DIAMETER = 15;

        public BallMonster(double x, double y, IList<Point> path) : base(x, y, path, 1.5)
        {
            Bounty = 20;
            Color = Colors.Cyan;
            Radius = DIAMETER / 2;
            life = originalLife = 200;
            mainElement = new Ellipse
            {
                StrokeThickness = 1.5,
                Stroke = new SolidColorBrush(Color),
                Fill = new SolidColorBrush(Colors.Black),
                Width = DIAMETER,
                Height = DIAMETER,
            };

            Game.AddElement(mainElement);
        }
        
        public override void Render()
        {
            Move(X - Radius, Y - Radius);
            base.Render();
        }
    }
}
