using System.Windows.Media;
using System.Windows.Shapes;

namespace VectorDefenceSL.Particles
{
    public class MissleTrail : Sprite
    {
        private readonly Brush fill = new SolidColorBrush(Colors.DarkGray);
        private static readonly double interval = Util.CalculateIntervalToComplete(1);

        public MissleTrail(double x, double y)
        {
            mainElement = new Rectangle
            {
                Fill = fill,
                Width = 1,
                Height = 1,
                IsHitTestVisible = false,
            };
            mainElement.SetCanvasPosition(x - .5, y - .5);
            Game.AddElement(mainElement);
        }

        public override void Animate()
        {
            alpha -= interval * Game.CurrentFrameMultiplier; 
            if (alpha <= 0)
            {
                MarkedForRemoval = true;
            }
        }

        public override void Render()
        {
            fill.Opacity = alpha;
        }
    }
}