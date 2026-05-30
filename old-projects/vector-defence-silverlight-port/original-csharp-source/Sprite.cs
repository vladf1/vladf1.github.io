using System.Windows.Shapes;

namespace VectorDefenceSL
{
    public abstract class Sprite : BoardElement
    {
        public bool MarkedForRemoval;
        public double DX;
        public double DY;
        
        protected Shape mainElement;
        protected double alpha = 1;

        protected Sprite()
        {
            Game.Sprites.Add(this);
        }

        public double Radius { get; protected set; }

        protected bool IsOutsideBounds
        {
            get
            {
                return X < 0 || Y < 0 || X > Game.CanvasWidth || Y > Game.CanvasHeight;
            }
        }

        public abstract void Render();

        public abstract void Animate();

        public virtual void RemoveFromCanvas()
        {
            Game.Children.Remove(mainElement);
        }

        protected void UpdatePosition()
        {
            var ndy = DY * Game.CurrentFrameMultiplier;
            var ndx = DX * Game.CurrentFrameMultiplier;
            Y += ndy; // move
            X += ndx;
        }

        protected void Move(double x, double y)
        {
            mainElement.SetCanvasPosition(x, y);
        }
    }
}
