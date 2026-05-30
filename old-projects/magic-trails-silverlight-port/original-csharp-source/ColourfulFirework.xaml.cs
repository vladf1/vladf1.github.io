/****************************************************************************

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.

-- Copyright 2009 Terence Tsang
-- admin@shinedraw.com
-- http://www.shinedraw.com
-- Your Flash vs Silverlight Repositry

****************************************************************************/


using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using System.Windows.Threading;

/*
*	A Colourful Firework Demonstratoin in C#
*   from shinedraw.com
*/

namespace ColorfulFireworks
{
    public partial class ColorfulFireworks : UserControl
    {

        private static double FIREWORK_NUM = 2;            // Number of Dot generated each time
        private static double GRAVITY = 0.5;               // Gravity
        private static double X_VELOCITY = 5;              // Maximum X Velocity
        private static double Y_VELOCITY = 5;              // Maximum Y Velocity
        private static int SIZE_MIN = 1;                   // Minimum Size
        private static int SIZE_MAX = 3;                   // Maximum Size

        private List<MagicDot> _fireworks = new List<MagicDot>();

        private DispatcherTimer _timer;                // on enter frame simulator
        private static int FPS = 24;                  // fps of the on enter frame event

        public ColorfulFireworks()
        {
            InitializeComponent();

            MouseMove += new MouseEventHandler(ColorfulFireworks_MouseMove);

            List<Object> array = new List<Object>();
            Object abc = new Object();
        }

        /////////////////////////////////////////////////////        
        // Handlers 
        /////////////////////////////////////////////////////	

        void ColorfulFireworks_MouseMove(object sender, MouseEventArgs e)
        {
            addFirework(e.GetPosition(this).X, e.GetPosition(this).Y);
        }

        void _timer_Tick(object sender, EventArgs e)
        {
            moveFirework();
        }

        /////////////////////////////////////////////////////        
        // Private Methods 
        /////////////////////////////////////////////////////	

        void moveFirework()
        {
            for (int i = _fireworks.Count - 1; i >= 0; i--)
            {
                MagicDot dot = _fireworks[i];
                dot.RunFirework();
                if (dot.Opacity <= 0.1)
                {
                    LayoutRoot.Children.Remove(dot);
                    _fireworks.Remove(dot);
                }
            }
        }

        void addFirework(double x, double y)
        {
            int seed = (int)DateTime.Now.Ticks;

            for (int i = 0; i < FIREWORK_NUM; i++)
            {
                seed += (int)DateTime.Now.Ticks;
                Random r = new Random(seed);
                double size = SIZE_MIN + (SIZE_MAX - SIZE_MIN) * r.NextDouble();
                byte red = (byte)(128 + (128 * r.NextDouble()));
                byte green = (byte)(128 + (128 * r.NextDouble()));
                byte blue = (byte)(128 + (128 * r.NextDouble()));

                double xVelocity = X_VELOCITY - 2 * X_VELOCITY * r.NextDouble();
                double yVelocity = -Y_VELOCITY * r.NextDouble();

                MagicDot dot = new MagicDot(red, green, blue, size);
                dot.X = x;
                dot.Y = y;
                dot.XVelocity = xVelocity;
                dot.YVelocity = yVelocity;
                dot.Gravity = GRAVITY;
                dot.RunFirework();
                _fireworks.Add(dot);

                LayoutRoot.Children.Add(dot);
            }
        }


        /////////////////////////////////////////////////////        
        // Public Methods 
        /////////////////////////////////////////////////////	

        public void Start()
        {
            _timer = new DispatcherTimer();
            _timer.Interval = new TimeSpan(0, 0, 0, 0, 1000 / FPS);
            _timer.Tick += new EventHandler(_timer_Tick);
            _timer.Start();
        }
    }
}
