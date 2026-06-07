using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using VectorDefenceSL.Monsters;
using VectorDefenceSL.Towers;

namespace VectorDefenceSL
{
    public static class Util
    {
        public static readonly Random Rand = new Random();

        public static double RandomInRange(double minVal, double maxVal)
        {
            return minVal + (Rand.NextDouble() * (maxVal - minVal));
        }

        public static double CalculateDistance(double x1, double y1, double x2, double y2)
        {
            double xdiff = x2 - x1;
            double part1 = xdiff * xdiff;
            double ydiff = y2 - y1;
            double part2 = ydiff * ydiff;
            double underRadical = part1 + part2;
            double result = Math.Sqrt(underRadical);
            return result;
        }

        public static void StopIfActive(this Storyboard storyboard)
        {
            if (storyboard.GetCurrentState() == ClockState.Active)
            {
                storyboard.Stop();
            }            
        }

        public static void SetVisiblity(this UIElement element, bool visible)
        {
            element.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;
        }

        public static void SetCanvasPosition(this UIElement element, double x, double y)
        {
            Canvas.SetTop(element, y);
            Canvas.SetLeft(element, x);
        }

        public static void CalculateLocation(double angle, double distance, out double x, out double y)
        {
            x = distance * Math.Cos(angle);
            y = distance * Math.Sin(angle);
        }

        public static double CalculateAngle(double sourceX, double sourceY, double targetX, double targetY)
        {
            var angle = Math.Atan2(targetY - sourceY, targetX - sourceX);
            return angle;
        }

        public static double GetDistanceSquared(double x1, double y1, double x2, double y2, double minDistance, double minDistanceSquared)
        {
            if (Math.Abs(x1 - x2) > minDistance)
            {
                return -1;
            }

            if (Math.Abs(y1 - y2) > minDistance)
            {
                return -1;
            }

            double part1 = Math.Pow((x2 - x1), 2);
            double part2 = Math.Pow((y2 - y1), 2);
            double underRadical = part1 + part2;
            if (minDistanceSquared < underRadical)
            {
                return -1;
            }

            return underRadical;
        }

        public static bool IsWithinDistance(double x1, double y1, double x2, double y2, double distance)
        {
            if (Math.Abs(x1 - x2) > distance)
            {
                return false;
            }

            if (Math.Abs(y1 - y2) > distance)
            {
                return false;
            }

            double part1 = Math.Pow((x2 - x1), 2);
            double part2 = Math.Pow((y2 - y1), 2);
            double underRadical = part1 + part2;
            bool result = distance * distance > underRadical;
            return result;
        }

        public static bool IsWithinDistance(this Monster m, double x2, double y2, double distance)
        {
            return IsWithinDistance(m.X, m.Y, x2, y2, distance);
        }

        public static double CalculateIntervalToComplete(double seconds)
        {
            return 1d / seconds / 60d;
        }

        /*
        public static Point ClosestPointOnLine(double lx1, double ly1, double lx2, double ly2, double x0, double y0)
        {
            double A1 = ly2 - ly1;
            double B1 = lx1 - lx2;
            double C1 = (ly2 - ly1) * lx1 + (lx1 - lx2) * ly1;
            double C2 = -B1 * x0 + A1 * y0;
            double det = A1 * A1 - -B1 * B1;
            double cx;
            double cy;
            if (det != 0)
            {
                cx = (A1 * C1 - B1 * C2) / det;
                cy = (A1 * C2 - -B1 * C1) / det;
            }
            else
            {
                cx = x0;
                cy = y0;
            }
            return new Point(cx, cy);
        }

        public static double GetDistanceToSegment(double x1, double y1, double x2, double y2, double pointX, double pointY) // ; x3,y3 = that lonely point
        {
            var px = x2 - x1;
            var py = y2 - y1;
            var u = ((pointX - x1) * px + (pointY - y1) * py) / (px * px + py * py);
            u = (u > 1) ? 1 : (u < 0) ? 0 : u;
            var x = x1 + u * px;
            var y = y1 + u * py;
            var dx = x - pointX;
            var dy = y - pointY;
            return Math.Sqrt(dx * dx + dy * dy);
        }
        */

        public static bool IsWithinDistanceToSegment(double x1, double y1, double x2, double y2, double pointX, double pointY, double distance) 
        {
            var px = x2 - x1;
            var py = y2 - y1;
            var u = (((pointX - x1) * px) + ((pointY - y1) * py)) / ((px * px) + (py * py));
            u = (u > 1) ? 1 : (u < 0) ? 0 : u;
            var x = x1 + (u * px);
            var y = y1 + (u * py);
            var dx = x - pointX;
            var dy = y - pointY;
            return (distance * distance) > (dx * dx) + (dy * dy);
        }

        public static SolidColorBrush GetColorFromHex(string hexaColor)
        {
            byte position = 0;
            string newColor = hexaColor.Replace("#", string.Empty);

            // get the red value
            byte red = Convert.ToByte(newColor.Substring(position, 2), 16);
            position += 2;

            // get the green value
            byte green = Convert.ToByte(newColor.Substring(position, 2), 16);
            position += 2;

            // get the blue value
            byte blue = Convert.ToByte(newColor.Substring(position, 2), 16);

            // create the SolidColorBrush object
            var brush = new SolidColorBrush(Color.FromArgb(255, red, green, blue));
            return brush;
        }

        public static double DegreesToRadians(double angle)
        {
            return angle / 180 * Math.PI;
        }

        public static double GetAngleInDegrees(double angle)
        {
            return angle * (180 / Math.PI);
        }

        public static double GetTowerRange(TowerBuildingMode towerMode)
        {
            switch (towerMode)
            {
                case TowerBuildingMode.GunTower:
                    return 60d;
                case TowerBuildingMode.LaserTower:
                    return 100d;
                case TowerBuildingMode.MissleTower:
                    return 150d;
                default:
                    return 70d;
            }
        }

        public static Tower CreateTower(Point pos, TowerBuildingMode towerMode)
        {
            Tower newTower;
            switch (towerMode)
            {
                case TowerBuildingMode.GunTower:
                    newTower = new GunTower(pos.X, pos.Y);
                    break;
                case TowerBuildingMode.LaserTower:
                    newTower = new LaserTower(pos.X, pos.Y);
                    break;
                case TowerBuildingMode.MissleTower:
                    newTower = new MissleTower(pos.X, pos.Y);
                    break;
                default:
                    newTower = new SlowingTower(pos.X, pos.Y);
                    break;
            }
            return newTower;
        }

        public static Color CreateRandomColor()
        {
            return Color.FromArgb(255, (byte)Rand.Next(50, 255), (byte)Rand.Next(50, 255), (byte)Rand.Next(50, 255));
        }
    }
}

