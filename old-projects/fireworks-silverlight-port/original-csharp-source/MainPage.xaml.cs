using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Resources;
using System.Windows.Shapes;

namespace Fireworks_Silverlight
{
    public partial class MainPage
    {
        private readonly bool renderShapesWithFading;

        private const int COLOR_RANGE = 20, MIN_COLOR = 30, MAX_COLOR = 255 - COLOR_RANGE, AlphaShift = 255 << 24, TicksPerSecond = 10000000;
        private const double BaseTicksPerFrame = TicksPerSecond / 60; // (ticks in 1 second) / (base 60 fps target)

        private long fireInterval = TicksPerSecond;
        private long lastTimed = DateTime.Now.Ticks;
        private long lastFired;
        private long lastAnimated;
        private int framesRendered, fps;
        private readonly List<BaseSprite> sprites = new List<BaseSprite>();
        private int height, width;
        private WriteableBitmap bmp;
        private readonly Rectangle blackoutRectangle = new Rectangle();

        private static readonly StreamResourceInfo sri = Application.GetResourceStream(new Uri("fire-sound.mp3", UriKind.Relative));
        private readonly List<MediaElement> mediaElements = new List<MediaElement>();

        public MainPage()
        {
            InitializeComponent();
            Application.Current.Host.Settings.MaxFrameRate = 240;
            // Application.Current.Host.Settings.EnableFrameRateCounter = true;
            CompositionTarget.Rendering += RenderFrame;
            Projectile.ExplosionFunc = OnProjectileExplosion;

            string val;
            Application.Current.Host.InitParams.TryGetValue("RenderWithShapes", out val);
            bool boolVal;
            if (bool.TryParse(val, out boolVal))
            {
                renderShapesWithFading = boolVal;
            }
            else
            {
                renderShapesWithFading = false;
            }

            renderShapesWithFading = true;
            
            for (var i = 0; i < 5; i++)
            {
                mediaElements.Add(new MediaElement());
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
                var timeBetweenFrames = now - lastAnimated;
                multiplier = timeBetweenFrames / BaseTicksPerFrame;

                // calculate fps
                if (now - lastTimed >= TicksPerSecond)
                {
                    fps = framesRendered;
                    framesRendered = 0;
                    lastTimed = now;
                }

                if (now - lastFired >= fireInterval)
                {
                    int count = renderShapesWithFading ? 1 : Util.Rand.Next(1, 4); // from 1 to 3
                    Fire(count);
                    lastFired = now;
                    fireInterval = (long)(TicksPerSecond * Util.RandomInRange(.5, 2));
                }
            }
            lastAnimated = now;

            var copy = new List<BaseSprite>(sprites);
            sprites.Clear();
            foreach (var s in copy)
            {
                bool removed = s.Animate(height, width, multiplier);
                if (!removed)
                {
                    sprites.Add(s);
                }
            }

            if (renderShapesWithFading)
            {
                FadeScreen(multiplier);
                foreach (var s in sprites)
                {
                    s.Render(bmp);
                }
            }
            else
            {
                var pixels = bmp.Pixels;
                Array.Clear(pixels, 0, pixels.Length);
                foreach (var s in sprites)
                {
                    s.Render(bmp, height, width, pixels);
                }
            }

            bmp.Invalidate();
            spritesText.Text = "FPS: " + fps + ", Sprites: " + sprites.Count;

            framesRendered++;
        }

        private void Fire(int count)
        {
            for (var i = 0; i < count; i++)
            {
                sprites.Add(new Projectile(width, height));
            }
        }

        private void OnProjectileExplosion(double x, double y)
        {
            if (soundCheckBox.IsChecked.HasValue && soundCheckBox.IsChecked.Value)
            {
                foreach (var m in mediaElements)
                {
                    var state = m.CurrentState;
                    if (state == MediaElementState.Paused || state == MediaElementState.Closed)
                    {
                        m.SetSource(sri.Stream); // Sets the MediaElement to point at the added resource
                        m.Play(); // Plays the sound    
                        break;
                    }
                }
            }

            var min = renderShapesWithFading ? 10 : 27;
            var max = renderShapesWithFading ? 50 : 190;
            var count = Util.Rand.Next(min, max);
            var r = Util.Rand.Next(MIN_COLOR, MAX_COLOR);
            var g = Util.Rand.Next(MIN_COLOR, MAX_COLOR);
            var b = Util.Rand.Next(MIN_COLOR, MAX_COLOR);
            for (var i = 0; i < count; i++) 
            {
                var newBubble = new Bubble(x, y, r, g, b, renderShapesWithFading);
                sprites.Add(newBubble);
            }
        }

        private void UserControl_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            Fire(renderShapesWithFading ? 1 : 2);
        }

        private void UserControl_SizeChanged(object sender, SizeChangedEventArgs e)
        {
            height = (int)canvas.ActualHeight;
            width = (int)canvas.ActualWidth;
            bmp = new WriteableBitmap(width, height);
            blackoutRectangle.Width = width;
            blackoutRectangle.Height = height;
            image.Source = bmp;
            soundCheckBox.SetValue(Canvas.LeftProperty, width - soundCheckBox.ActualWidth - 5);
        }

        private void UserControl_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Space)
            {
                UserControl_MouseLeftButtonDown(null, null);
            }
        }

        private void FadeScreen(double multiplier)
        {
            var reduceAlpha = (byte)(.1 * multiplier * 255);
            blackoutRectangle.Fill = new SolidColorBrush(Color.FromArgb(reduceAlpha, 0, 0, 0));
            
            bmp.Render(blackoutRectangle, null);
        }

        public static void FadeScreenByPixel(int[] pixels, double multiplier)
        {
            var reduceAlpha = .1 * multiplier;
            var fadeAmount = 1 - reduceAlpha;

            var len = pixels.Length;
            for (int index = 0; index < len; index++)
            {
                int c = pixels[index];
                
                if (c != 0 && c != AlphaShift)
                {
                    var r = (byte)(c >> 16);
                    var g = (byte)(c >> 8);
                    var b = (byte)(c);

                    r = (byte)(fadeAmount * r);
                    g = (byte)(fadeAmount * g);
                    b = (byte)(fadeAmount * b);
                    
                    var newColor = (r << 16) | (g << 8) | b;
                    pixels[index] = newColor;
                }
            }
        }
    }
}
