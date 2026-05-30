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
using System.Net;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Ink;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;

/*
*	A Colourful Firework Demonstratoin in C#
*   from shinedraw.com
*/

namespace ColorfulFireworks
{
    public class MagicDot : Canvas
    {
        // Please study the code for the usage of these variables
        private static int ELLIPSE_COUNT = 5;      // Number of ellipse make up of the magic dot
        private static double OPACITY = 0.6;       // Initial opacity of the magic dot
        private static double OPACITY_INC = -0.15; // Opacitiy Increment for the next ellipse

        // for firwork
        public double FireworkOpacityInc = -0.02;
        public double XVelocity = 1;
        public double YVelocity = 1;
        public double Gravity = 1;

        public MagicDot(byte red, byte green, byte blue, double size)
        {
            double opac = OPACITY;

            for (int i = 0; i < ELLIPSE_COUNT; i++)
            {
                Ellipse ellipse = new Ellipse();
                ellipse.Width = size;
                ellipse.Height = size;
                if (i == 0)
                {
                    // add a white dot in the center
                    ellipse.Fill = new SolidColorBrush(Color.FromArgb(255, 255, 255, 255));
                }
                else
                {
                    ellipse.Fill = new SolidColorBrush(Color.FromArgb(255, red, green, blue));
                    ellipse.Opacity = opac;
                    opac += OPACITY_INC;
                    size += size;
                }

                // reposition the dots and add to the stage
                ellipse.SetValue(Canvas.LeftProperty, -ellipse.Width / 2);
                ellipse.SetValue(Canvas.TopProperty, -ellipse.Height / 2);
                this.Children.Add(ellipse);
            }
        }

        /////////////////////////////////////////////////////        
        // Public Methods
        /////////////////////////////////////////////////////	


        public void RunFirework()
        {
            this.Opacity += FireworkOpacityInc;

            YVelocity += Gravity;
            X = X + XVelocity;
            Y = Y + YVelocity;
        }

        /////////////////////////////////////////////////////        
        // Properties
        /////////////////////////////////////////////////////	

        public double X
        {
            get { return (double)(GetValue(Canvas.LeftProperty)); }
            set { SetValue(Canvas.LeftProperty, value); }
        }

        public double Y
        {
            get { return (double)(GetValue(Canvas.TopProperty)); }
            set { SetValue(Canvas.TopProperty, value); }
        }


    }
}
