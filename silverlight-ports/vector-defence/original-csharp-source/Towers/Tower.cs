using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using VectorDefenceSL.Monsters;

namespace VectorDefenceSL.Towers
{
    public abstract class Tower : BoardElement
    {
        public const double TowerRadius = 10;
        public const int MaxLevel = 6;

        protected const double ToolbarAnimationRotationStep = 0.052359877559829883; // 3 degrees

        private bool paused;
        private Stopwatch stopwatch;

        protected Tower(Button btn, TowerBuildingMode mode)
        {
            btn.Tag = mode;
            btn.Content = Container = new Canvas();
            X = Container.ActualWidth / 2;
            Y = Container.ActualHeight / 2;

            btn.MouseEnter += delegate
            {
                Game.TowerAnimation += AnimateToolboxRendering;
            };
            btn.MouseLeave += delegate
            {
                Game.TowerAnimation -= AnimateToolboxRendering;
            };
            PerformRender();
        }

        protected Tower(double x, double y)
        {
            Container = Game.Canvas;
            X = x;
            Y = y;         
            Game.Towers.Add(this);
            Game.Withdraw(Cost);
            Game.TowerAnimation += Animate;
            Game.Paused += Game_Paused;
            Game.Resumed += Game_Resumed;
        }

        public int Level { get; private set; }

        public int Cost { get; protected set; }

        public double Range { get; protected set; }

        protected double MillisecondsBetweenFiring { private get; set; }

        protected bool CanFireNow
        {
            get
            {
                bool canFire = stopwatch == null || stopwatch.ElapsedMilliseconds >= MillisecondsBetweenFiring;
                return canFire;
            }
        }

        protected Canvas Container { get; private set; }

        public abstract void Render();

        public void Upgrade()
        {
            if (Level < MaxLevel)
            {
                Level++;
                UpgradeWork(Level);
                Cost += 50;
            }
        }

        public virtual void RemoveTowerFromCanvas()
        {
            Game.TowerAnimation -= Animate;
            Game.Paused -= Game_Paused;
            Game.Resumed -= Game_Resumed;
        }

        protected static Point CalculateWhereToShoot(Point source, Sprite enemy, double bulletSpeed)
        {
            // target is the inital enemy position, relative to cannon.
            var target = new Point(enemy.X - source.X, enemy.Y - source.Y);
            // calculate 'a' term.
            var a = (bulletSpeed * bulletSpeed) - ((enemy.DX * enemy.DX) + (enemy.DY * enemy.DY));
            // calculate 'b' term.
            var b = (target.X * enemy.DX) + (target.Y * enemy.DY);
            // calculate 'c' term.
            var c = (target.X * target.X) + (target.Y * target.Y);
            // calculate 'd' term.
            var d = (b * b) + (a * c);
            var t = 0d;
            if (d >= 0)
            {
                // calculate the time of impact
                t = (b + Math.Sqrt(d)) / a;
                // negative values are not accepted
                if (t < 0)
                {
                    t = 0;
                }
            }

            // calculate the bullet's target position
            var targetX = enemy.X + (enemy.DX * t);
            var targetY = enemy.Y + (enemy.DY * t);
            return new Point(targetX, targetY);
        }

        protected abstract void Animate();

        protected void TimeFiring()
        {
            stopwatch = Stopwatch.StartNew();
        }

        protected virtual void AnimateToolboxRendering()
        {
        }

        /* from http://www.phaedy.com/gamez/2010/aim-and-hit-with-projectile/
         */

        protected Monster GetClosestMonsterInRange()
        {
            double smallestDistance = double.MaxValue;
            Monster closestMonster = null;
            double fireRangeSquared = Range * Range;

            foreach (var m in Game.CurrentFrameMonsters)
            {
                if (m.MarkedForRemoval)
                {
                    continue;
                }

                var distSquared = Util.GetDistanceSquared(X, Y, m.X, m.Y, Range, fireRangeSquared);
                if (distSquared == -1)
                {
                    continue;
                }

                if (distSquared < smallestDistance)
                {
                    closestMonster = m;
                    smallestDistance = distSquared;
                }
            }

            return closestMonster;
        }

        protected virtual void UpgradeWork(int newLevel)
        {
            int rangeIncrease = newLevel * 4;
            Range += rangeIncrease;
        }

        protected void HandleTowerSelection(object sender, MouseButtonEventArgs e)
        {
            if (Game.SelectedTower != this)
            {
                Game.SetSelectedTower(this);
            }
            e.Handled = true;
        }

        private void PerformRender()
        {
            Render();
        }

        private void Game_Paused()
        {
            if (stopwatch != null)
            {
                paused = true;
                stopwatch.Stop();
            }
        }

        private void Game_Resumed()
        {
            if (paused)
            {
                paused = false;
                stopwatch.Start();
            }
        }
    }
}