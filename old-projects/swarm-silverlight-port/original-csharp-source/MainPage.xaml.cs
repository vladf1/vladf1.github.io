using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using System.Threading;

namespace Pretty_Swarm
{
    public partial class MainPage : UserControl
    {
        private const int DefaultNumberOfSprites = 2500;
        private const bool DefaultRenderWithShapes = false;

        private const int TicksPerSecond = 10000000;
        private const double BaseTicksPerFrame = TicksPerSecond / 60; // (ticks in 1 second) / (base 60 fps target)

        private readonly int numberOfSprites;
        private readonly bool renderWithShapes;

        private long lastAnimated;
        private long lastTimed = DateTime.Now.Ticks;

        private int framesRendered, fps;
        private Sprite[] sprites;
        private int height, width;
        private WriteableBitmap bmp;
        private double mouseX, mouseY;
        private Random r = new Random();
        private Line line = new Line { StrokeThickness = 5, StrokeEndLineCap = PenLineCap.Round, StrokeStartLineCap = PenLineCap.Round };
        private readonly Rectangle rect = new Rectangle();
        
        public MainPage()
        {
            InitializeComponent();
            Application.Current.Host.Settings.MaxFrameRate = 240;
            Application.Current.Host.Settings.EnableFrameRateCounter = true;
            CompositionTarget.Rendering += RenderFrame;
            string val;

            Application.Current.Host.InitParams.TryGetValue("NumberOfSprites", out val);
            if (!int.TryParse(val, out numberOfSprites))
            {
                numberOfSprites = DefaultNumberOfSprites;
            }

            Application.Current.Host.InitParams.TryGetValue("RenderWithShapes", out val);
            bool boolVal;
            if (bool.TryParse(val, out boolVal))
            {
                renderWithShapes = boolVal;
            }
            else
            {
                renderWithShapes = DefaultRenderWithShapes;
            }
        }

        private void RenderFrame(object sender, EventArgs e)
        {
            if (bmp == null)
                return;

            
            long now = DateTime.Now.Ticks;
            double multiplier = 0;
            if (lastAnimated != 0)  // skip first frame
            {
                long timeBetweenFrames = now - lastAnimated;
                multiplier = timeBetweenFrames / BaseTicksPerFrame;

                if (now - lastTimed >= TicksPerSecond) // calculate fps
                {
                    fps = framesRendered;
                    framesRendered = 0;
                    lastTimed = now;
                }
            }
            lastAnimated = now;


            foreach (var s in sprites)
            {
                s.Animate(mouseX, mouseY, width, height, multiplier);
            }

            if (renderWithShapes)
            {
                FadeScreen(multiplier);
                foreach (var s in sprites)
                {
                    s.Render(bmp, line);
                }
            }
            else
            {
                var reduceAlpha = .1 * multiplier;
                var fadeBy = 1 - reduceAlpha;
                var pixels = bmp.Pixels;
                GraphicUtils.FadeScreen(pixels, fadeBy);
                foreach (var s in sprites)
                {
                    s.Render(height, width, pixels);
                }
            }

            bmp.Invalidate();

            spritesText.Text = "FPS: " + fps + ", Sprites: " + numberOfSprites;
            framesRendered++;
        }

        private void FadeScreen(double multiplier)
        {
            var reduceAlpha = (byte)(.1 * multiplier * 255);
            rect.Fill = new SolidColorBrush(Color.FromArgb(reduceAlpha, 0, 0, 0));
            bmp.Render(rect, null);
        }

        private void UserControl_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            UserControl_MouseMove(sender, e);
            foreach (var s in sprites)
            {
                s.RepelMode = true;
            }
        }

        private void UserControl_SizeChanged(object sender, SizeChangedEventArgs e)
        {
            height = (int)ActualHeight;
            width = (int)ActualWidth;
            bmp = new WriteableBitmap(width, height);
            image.Source = bmp;
            rect.Width = width;
            rect.Height = height;
            if (sprites == null)
            {
                sprites = new Sprite[numberOfSprites];
                for (var i = 0; i < numberOfSprites; i++)
                {
                    var x = r.Next(0, width);
                    var y = r.Next(0, height);
                    sprites[i] = new Sprite(x, y);
                }
            }
        }

        private void UserControl_MouseMove(object sender, MouseEventArgs e)
        {
            var pos = e.GetPosition(null);
            mouseX = pos.X;
            mouseY = pos.Y;
        }

        private void UserControl_MouseLeave(object sender, MouseEventArgs e)
        {
            mouseY = mouseX = -1;
            UserControl_MouseLeftButtonUp(null, null);
        }

        private void UserControl_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            foreach (var s in sprites)
            {
                s.RepelMode = false;
            }
        }
    }
}
