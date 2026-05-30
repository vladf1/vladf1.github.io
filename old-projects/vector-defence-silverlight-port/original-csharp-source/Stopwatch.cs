using System;

namespace VectorDefenceSL
{
    /// <summary>
    /// Stopwatch is used to measure the general performance of Silverlight functionality. Silverlight
    /// does not currently provide a high resolution timer as is available in many operating systems,
    /// so the resolution of this timer is limited to milliseconds. This class is best used to measure
    /// the relative performance of functions over many iterations.
    /// </summary>
    public sealed class Stopwatch
    {
        private bool isRunning;
        private long startTick;
        private long elapsed;

        /// <summary>
        /// Gets the Elapsed time as the total number of milliseconds.
        /// </summary>
        public long ElapsedMilliseconds
        {
            get { return GetCurrentElapsedTicks() / TimeSpan.TicksPerMillisecond; }
        }

        /// <summary>
        /// Creates a new instance of the class and starts the watch immediately.
        /// </summary>
        /// <returns>An instance of Stopwatch, running.</returns>
        public static Stopwatch StartNew()
        {
            var sw = new Stopwatch();
            sw.Start();
            return sw;
        }

        /// <summary>
        /// Begins the timer.
        /// </summary>
        public void Start()
        {
            if (!isRunning)
            {
                startTick = GetCurrentTicks();
                isRunning = true;
            }
        }

        /// <summary>
        /// Stops the current timer.
        /// </summary>
        public void Stop()
        {
            if (isRunning)
            {
                elapsed += GetCurrentTicks() - startTick;
                isRunning = false;
            }
        }

        private static long GetCurrentTicks()
        {
            // TickCount: Gets the number of milliseconds elapsed since the system started.
            return Environment.TickCount * TimeSpan.TicksPerMillisecond;
        }

        private long GetCurrentElapsedTicks()
        {
            return elapsed + (isRunning ? (GetCurrentTicks() - startTick) : 0);
        }
    }
}
