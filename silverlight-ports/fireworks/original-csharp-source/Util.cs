using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace Fireworks_Silverlight
{
    static class Util
    {
        public static readonly Random Rand = new Random();

        public static double RandomInRange(double minVal, double maxVal)
        {
            return minVal + (Rand.NextDouble() * (maxVal - minVal));
        }

    }
}

