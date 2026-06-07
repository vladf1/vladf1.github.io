using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using VectorDefenceSL.Monsters;
using VectorDefenceSL.Particles;
using VectorDefenceSL.Towers;

namespace VectorDefenceSL
{
    public static class Game
    {
        public const int TicksPerSecond = 10000000;
        public const double BaseTicksPerFrame = TicksPerSecond / 60; // (ticks in 1 second) / (base 60 fps target)

        public static readonly List<Sprite> Sprites = new List<Sprite>();
        public static readonly List<Tower> Towers = new List<Tower>();

        public static int MonstersAllowedToEscape;

        public static Canvas Canvas;
        public static UIElementCollection Children;

        public static double CanvasHeight;

        public static Monster[] CurrentFrameMonsters;
        public static double CurrentFrameMultiplier;
        public static long TicksNow;
        public static double CanvasWidth;

        private static readonly object moneyLock = new object();

        private static int monstersKilled;
        private static int monstersEscaped;
        private static int money;
        private static Tower selectedTowerValue;

        public static event Action TowerAnimation;

        public static event Action<Tower, bool> TowerSelected;

        public static event Action TowerUnselected;

        public static event Action BalanceChanged;

        public static event Action Paused;

        public static event Action Resumed;

        public static event Action<Monster> MonsterKilled;

        public static event Action<Monster> MonsterEscaped;

        public static Tower SelectedTower
        {
            get
            {
                return selectedTowerValue;
            }

            set
            {
                SetSelectedTower(value);            
            }
        }

        public static int Balance
        {
            get { return money; }
        }

        public static bool MonstersComing { get; set; }

        public static bool LastMonsterGone { get; set; }

        public static bool IsPlaying { get; private set; }

        public static void ResumeGame()
        {
            if (Resumed != null)
            {
                Resumed();
            }
            IsPlaying = true;
        }

        public static void PauseGame()
        {
            if (Paused != null)
            {
                Paused();
            }
            IsPlaying = false;
        }

        public static void ExecuteTowerAnimations()
        {
            if (TowerAnimation != null)
            {
                TowerAnimation();
            }
        }

        public static void SetSelectedTower(Tower value)
        {
            var oldValue = selectedTowerValue;
            selectedTowerValue = value;
            if (selectedTowerValue != null)
            {
                bool towerWasSelectedBefore = oldValue != null;
                TowerSelected(selectedTowerValue, towerWasSelectedBefore);
            }
            else if (oldValue != null)
            {
                TowerUnselected();
            }                    
        }

        public static void AddElement(UIElement e)
        {
            Children.Add(e);
        }

        public static void KillMonster(Monster m)
        {
            var interval = Util.CalculateIntervalToComplete(.4);
            for (int i = 0; i < 35; i++)
            {
                var size = Util.Rand.Next(2, 5);
                new ExplosionParticle(m.X, m.Y, size, m.Color, interval);
            }

            interval = Util.CalculateIntervalToComplete(.5);
            for (int i = 0; i < 35; i++)
            {
                var size = Util.Rand.Next(1, 4);
                new ExplosionParticle(m.X, m.Y, size, m.Color, interval);
            }

            monstersKilled++;
            m.MarkedForRemoval = true;
            MonsterKilled(m);
        }

        public static void EscapeMonster(Monster m)
        {
            var interval = Util.CalculateIntervalToComplete(1);
            for (int i = 0; i < 150; i++)
            {
                Color color = Util.CreateRandomColor();
                var size = Util.Rand.Next(1, 4);
                new ExplosionParticle(m.X, m.Y, size, color, interval);
            }             
            monstersEscaped++;
            m.MarkedForRemoval = true;
            MonsterEscaped(m);
        }

        public static void InitializeGame(Canvas c)
        {
            Canvas = c;
            CanvasHeight = Canvas.Height;
            CanvasWidth = Canvas.Width;
            Children = c.Children;
        }

        public static void CreateExplosionParticles(double x, double y, int particleCount, double particleSize, Color color, double burnDown)
        {
            for (int i = 0; i < particleCount; i++)
            {
                new ExplosionParticle(x, y, particleSize, color, burnDown);
            }
        }

        public static void ResetBalance(int amount)
        {
            lock (moneyLock)
            {
                money = amount;
            }
            BalanceChanged();
        }

        public static void Deposit(int amount)
        {
            lock (moneyLock)
            {
                money += amount;    
            }
            BalanceChanged();
        }

        public static bool Withdraw(int amount)
        {
            lock (moneyLock)
            {
                if (amount > money)
                {
                    return false;
                }
                money -= amount;
            }
            BalanceChanged();
            return true;
        }

        public static void ClearField()
        {
            monstersKilled = monstersEscaped = 0;
            SelectedTower = null;
            foreach (var t in Towers)
            {
                t.RemoveTowerFromCanvas();    
            }
            Towers.Clear();

            foreach (var s in Sprites)
            {
                s.RemoveFromCanvas();
            }
            Sprites.Clear();
        }

        public static void CreateRandomMonster(PointCollection points)
        {
            double rand = Util.Rand.NextDouble();
            if (rand < .333)
            {
                CreateMonster('b', points);
            }
            else if (rand >= .333 && rand < .666)
            {
                CreateMonster('t', points);
            }
            else
            {
                CreateMonster('s', points);
            }
        }

        public static void CreateMonster(char c, PointCollection points)
        {
            Point start = points[0];
            switch (c)
            {
                case 'b':
                    new BallMonster(start.X, start.Y, points);
                    return;
                case 't':
                    new TriangleMonster(start.X, start.Y, points);
                    return;
                default:
                    new SquareMonster(start.X, start.Y, points);
                    return;
            }
        }
    }
}
