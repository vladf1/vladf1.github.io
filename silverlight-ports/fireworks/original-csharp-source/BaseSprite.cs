using System.Windows.Media.Imaging;

namespace Fireworks_Silverlight
{
    public abstract class BaseSprite
    {
        protected double x, y, dx, dy, oldx, oldy;

        public abstract bool Animate(double height, double width, double multiplier);
        
        public abstract void Render(WriteableBitmap bmp, int h, int w, int[] pixels);

        public abstract void Render(WriteableBitmap bmp);

        protected void UpdatePosition(double multiplier)
        {
            var ndy = dy * multiplier;
            var ndx = dx * multiplier;
            y += ndy; // move
            x += ndx;
        }
    }
}
