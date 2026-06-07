using System.Windows.Media;
using System.Windows.Shapes;

namespace VectorDefenceSL.Particles
{
    public class SlowingIndicator : Sprite
    {
        private readonly Sprite target;
        private readonly Brush stroke;
        private readonly Line line;
        private readonly Sprite lineFrom;
        private readonly double fadeBy;

        public SlowingIndicator(double x, double y, Sprite targetSprite) : this(targetSprite)
        {
            stroke = new SolidColorBrush(Colors.Yellow);
            line.Stroke = stroke;
            alpha = .8;
            line.X1 = x;
            line.Y1 = y;
            fadeBy = Util.CalculateIntervalToComplete(1);
        }

        public SlowingIndicator(Sprite from, Sprite targetSprite)
            : this(targetSprite)
        {
            stroke = new SolidColorBrush(Colors.Green);
            line.Stroke = stroke;
            alpha = .7;
            fadeBy = 0;
            lineFrom = from;
        }

        private SlowingIndicator(Sprite targetSprite)
        {
            target = targetSprite;
            mainElement = line = new Line
                                     {
                                         StrokeThickness = 1,
                                         Stroke = stroke,
                                         IsHitTestVisible = false,
                                     };
            Game.AddElement(mainElement);
        }

        public override void Animate()
        {
            if (target.MarkedForRemoval || (lineFrom != null && lineFrom.MarkedForRemoval))
            {
                alpha = 0;
            }
            else
            {
                alpha -= fadeBy * Game.CurrentFrameMultiplier;
            }

            if (alpha <= 0)
            {
                MarkedForRemoval = true;
            }
        }

        public override void Render()
        {
            if (lineFrom != null)
            {
                line.X1 = lineFrom.X;
                line.Y1 = lineFrom.Y;
            }
            line.X2 = target.X;
            line.Y2 = target.Y;
            stroke.Opacity = alpha;
        }
    }
}