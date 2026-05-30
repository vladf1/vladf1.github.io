using System;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using VectorDefenceSL.Monsters;
using VectorDefenceSL.Particles;
using VectorDefenceSL.Towers;

namespace VectorDefenceSL
{
    public partial class MainPage
    {
        private long monsterCreationInterval;
        private long lastTimeMonsterCreated;
        private long lastAnimated;
        private TowerBuildingMode towerMode = TowerBuildingMode.GunTower;
        private LevelInfo currentLevel;
        private int currentMonsterIndex;
        private int monstersFiredOnThisLevel;

        public MainPage()
        {
            InitializeComponent();
            Application.Current.Host.Settings.MaxFrameRate = 240;
            Application.Current.Host.Settings.EnableFrameRateCounter = true;
            CompositionTarget.Rendering += RenderFrame;

            Game.InitializeGame(canvas);
            Game.TowerSelected += Game_TowerSelected;
            Game.TowerUnselected += Game_TowerUnselected;
            Game.BalanceChanged += Game_BalanceChanged;
            Game.MonsterKilled += Game_MonsterKilled;
            Game.MonsterEscaped += Game_MonsterEscaped;
            Game.Resumed += Game_Resumed;
            Game.Paused += Game_Paused;

            new GunTower(gunTowerButton);
            new LaserTower(laserTowerButton);
            new MissleTower(missleTowerButton);
            new SlowingTower(slowTowerButton);

            var levelSelectorPopup = new Popup();
            rootCanvas.Children.Add(levelSelectorPopup);
            var levelSelectorControl = new LevelSelector(levelSelectorPopup, LoadLevel);
            levelSelectorPopup.Child = levelSelectorControl;
            levelSelectorPopup.HorizontalOffset = (rootCanvas.Width - levelSelectorControl.Width) / 2;
            levelSelectorPopup.VerticalOffset = (rootCanvas.Height - levelSelectorControl.EstimatedHeight) / 2;
            levelSelectorPopup.IsOpen = true;
        }

        private void RenderFrame(object sender, EventArgs e)
        {
            if (!Game.IsPlaying)
            {
                lastAnimated = 0;
                return;
            }

            Game.TicksNow = DateTime.UtcNow.Ticks;
            if (lastAnimated != 0)  // skip first frame
            {
                long timeBetweenFrames = Game.TicksNow - lastAnimated;
                Game.CurrentFrameMultiplier = timeBetweenFrames / Game.BaseTicksPerFrame;
            }
            lastAnimated = Game.TicksNow;

            ReleaseMonster();
            
            var spritesCopy = Game.Sprites.ToArray();
            Game.CurrentFrameMonsters = spritesCopy.OfType<Monster>().ToArray();
            Game.Sprites.Clear();
            foreach (var sprite in spritesCopy)
            {
                sprite.Animate();
                if (sprite.MarkedForRemoval)
                {
                    sprite.RemoveFromCanvas();
                }
                else
                {
                    Game.Sprites.Add(sprite);
                }
            }

            Game.ExecuteTowerAnimations();

            foreach (var s in Game.Sprites)
            {
                s.Render();
            }

            if (Game.LastMonsterGone)
            {
                bool spritesLeft = Game.Sprites.Any(t => !(t is LaserRay) && !t.MarkedForRemoval);
                if (!spritesLeft)
                {
                    LoadRandomLevel();
                }
            }
        }

        private void UpdateSelectedTowerRendering(Tower t, bool towerWasSelectedBefore)
        {
            upgradeTowerButton.IsEnabled = t.Level != Tower.MaxLevel;

            towerSelectionIndicator.SetCanvasPosition(t.X - (towerSelectionIndicator.Width / 2), t.Y - (towerSelectionIndicator.Height / 2));
            towerSelectionIndicator.Visibility = Visibility.Visible;
            
            towerRangeIndicator.Height = towerRangeIndicator.Width = t.Range * 2;
            towerRangeIndicator.SetCanvasPosition(t.X - (towerRangeIndicator.Width / 2), t.Y - (towerRangeIndicator.Height / 2));

            if (!towerWasSelectedBefore)
            {
                showTowerRangeStoryboard.Begin();
            }
        }

        private void Game_Resumed()
        {
            pauseButton.Content = "||";
        }

        private void Game_Paused()
        {
            pauseButton.Content = "►";
        }

        private void CheckForLastMonsterOnTheLevel()
        {
            if (!Game.MonstersComing)
            {
                bool monstersLeft = Game.CurrentFrameMonsters.Any(m => !m.MarkedForRemoval);
                Game.LastMonsterGone = !monstersLeft;
            }
        }

        private void StartPlaying()
        {
            moneyTextBlock.Visibility = Visibility.Visible;
            pauseButton.Visibility = Visibility.Visible;
            towerTypes.Visibility = Visibility.Visible;

            var towerActionsX = (Width - towerActions.Width) / 2;
            var towerTypesX = (Width - towerTypes.Width) / 2;

            Canvas.SetLeft(towerActions, towerActionsX);
            Canvas.SetLeft(towerTypes, towerTypesX);

            towerActions.Opacity = 0;
            towerActions.Visibility = Visibility.Collapsed;
        }

        private void LoadLevel(LevelInfo level)
        {
            if (!Game.IsPlaying)
            {
                StartPlaying();
                Game.ResumeGame();
            }
            Game.LastMonsterGone = false;
            Game.MonstersComing = false;
            Game.ClearField(); // clear monsters and towers
            Game.ResetBalance(2000);
            levelNameTextBlock.Text = level.Name;
            levelNameTextBlock.Visibility = Visibility.Visible;
            levelNameStoryboard.Begin();
            currentLevel = level;

            Game.MonstersAllowedToEscape = currentLevel.MonstersAllowedEscape;

            currentMonsterIndex = 0;
            monstersFiredOnThisLevel = 0;
            polyline.Points = currentLevel.Points;

            var lastPoint = currentLevel.Points.Last();
            finalPoint.Visibility = Visibility.Visible;
            finalPoint.SetCanvasPosition(lastPoint.X - (finalPoint.Width / 2), lastPoint.Y - (finalPoint.Height / 2));

            leftToEscapeTextBlock.Text = Game.MonstersAllowedToEscape.ToString();
            leftToEscapeTextBlock.SetCanvasPosition(lastPoint.X - (leftToEscapeTextBlock.Width / 2), lastPoint.Y - (leftToEscapeTextBlock.ActualHeight / 2));
            leftToEscapeTextBlock.Visibility = Visibility.Visible;
        }

        private void LevelNameAnimationCompleted(object sender, EventArgs e)
        {
            levelNameTextBlock.Visibility = Visibility.Collapsed;
            Game.MonstersComing = true;
        }

        private void Game_BalanceChanged()
        {
            moneyTextBlock.Text = Game.Balance.ToString("C0");
        }

        private void Game_TowerUnselected()
        {
            hideTowerTypeButtonsStoryBoard.StopIfActive();
            showTowerTypeButtonsStoryBoard.Begin();

            towerSelectionIndicator.Visibility = Visibility.Collapsed;

            hideTowerRangeStoryboard.Begin();
        }

        private void Game_TowerSelected(Tower t, bool towerWasSelectedBefore)
        {
            if (!towerWasSelectedBefore)
            {
                showTowerTypeButtonsStoryBoard.StopIfActive();
                hideTowerTypeButtonsStoryBoard.Begin();
            }

            UpdateSelectedTowerRendering(t, towerWasSelectedBefore);
        }

        private void Game_MonsterEscaped(Monster monster)
        {
            Game.MonstersAllowedToEscape--;
            if (Game.MonstersAllowedToEscape < 0)
            {
                // remove all monsters and stop new monsters
                foreach (var m in Game.CurrentFrameMonsters)
                {
                    m.MarkedForRemoval = true;
                }
                Game.MonstersComing = false;
            }
            else
            {
                leftToEscapeTextBlock.Text = Game.MonstersAllowedToEscape.ToString();
            }
            CheckForLastMonsterOnTheLevel();
        }

        private void Game_MonsterKilled(Monster monster)
        {
            Game.Deposit(monster.Bounty);
            CheckForLastMonsterOnTheLevel();
        }

        private void LoadRandomLevel()
        {
            var randomLevel = Util.Rand.Next(0, LevelManager.Levels.Count);
            var level = LevelManager.Levels[randomLevel];
            LoadLevel(level);
        }

        private bool ValidateTowerPosition(Point pos)
        {
            bool outsideBounds = pos.X < Tower.TowerRadius || pos.Y < Tower.TowerRadius || pos.X > Game.Canvas.Width - Tower.TowerRadius || pos.Y > Game.Canvas.Height - Tower.TowerRadius;
            if (outsideBounds)
            {
                return false;
            }

            const double MinDistanceToLine = 20;
            const double MinDistanceToOtherTowers = 32;

            // check if not too close to other towers
            if (Game.Towers.Any(t => Util.IsWithinDistance(t.X, t.Y, pos.X, pos.Y, MinDistanceToOtherTowers)))
            {
                return false;
            }

            // check if too close to line segments
            for (var i = 0; i < currentLevel.Points.Count - 1; i++)
            {
                var p1 = currentLevel.Points[i];
                var p2 = currentLevel.Points[i + 1];

                bool tooCloseToRoad = Util.IsWithinDistanceToSegment(p1.X, p1.Y, p2.X, p2.Y, pos.X, pos.Y, MinDistanceToLine);
                if (tooCloseToRoad)
                {
                    return false;
                }
            }
            return true;
        }

        private Tower PlaceNewTower(Point pos)
        {
            Tower newTower = Util.CreateTower(pos, towerMode);
            if (newTower != null)
            {
                newTower.Render();
                ToggleFutureTowerIndicators(false);
            }
            
            return newTower;
        }

        private void Canvas_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (currentLevel != null && towerMode != TowerBuildingMode.None)
            {
                var pos = e.GetPosition(canvas);
                var canPlaceTower = ValidateTowerPosition(pos);
                if (canPlaceTower)
                {
                    Tower newTower = PlaceNewTower(pos);
                    Game.Withdraw(newTower.Cost);
                    towerMode = TowerBuildingMode.None;
                }
            }
            else
            {
                Game.SelectedTower = null;
            }
        }

        private void Canvas_MouseMove(object sender, MouseEventArgs e)
        {
            if (currentLevel != null && towerMode != TowerBuildingMode.None)
            {
                var pos = e.GetPosition(canvas);
                var canPlaceTower = ValidateTowerPosition(pos);

                if (canPlaceTower)
                {
                    horizontalTargetLine.X1 = horizontalTargetLine.X2 = pos.X;
                    verticalTargetLine.Y1 = verticalTargetLine.Y2 = pos.Y;
                    futureTower.SetCanvasPosition(pos.X - Tower.TowerRadius, pos.Y - Tower.TowerRadius);

                    var range = Util.GetTowerRange(towerMode);

                    futureTowerRangeIndicator.Width = futureTowerRangeIndicator.Height = range * 2;
                    futureTowerRangeIndicator.SetCanvasPosition(pos.X - range, pos.Y - range);
                }
                ToggleFutureTowerIndicators(canPlaceTower);
            }
        }

        private void Canvas_MouseLeave(object sender, MouseEventArgs e)
        {
            ToggleFutureTowerIndicators(false);
        }

        private void ToggleFutureTowerIndicators(bool canPlaceTower)
        {
            horizontalTargetLine.SetVisiblity(canPlaceTower);
            verticalTargetLine.SetVisiblity(canPlaceTower);
            futureTower.SetVisiblity(canPlaceTower);
            futureTowerRangeIndicator.SetVisiblity(canPlaceTower);
        }

        private void SellTowerButton_Click(object sender, RoutedEventArgs e)
        {
            Tower tower = Game.SelectedTower;
            if (tower != null)
            {
                var depositAmount = (int)(tower.Cost * .75);
                Game.Deposit(depositAmount);
                Game.Towers.Remove(tower);
                tower.RemoveTowerFromCanvas();
                Game.SelectedTower = null;
            }
        }

        private void UpgradeButton_Click(object sender, RoutedEventArgs e)
        {
            if (Game.SelectedTower != null && Game.SelectedTower.Level != Tower.MaxLevel)
            {
                bool worked = Game.Withdraw(50);
                if (worked)
                {
                    Game.SelectedTower.Upgrade();
                    UpdateSelectedTowerRendering(Game.SelectedTower, true);
                }
            }
        }

        private void TowerTypeButton_Click(object sender, RoutedEventArgs e)
        {
            var button = (Button)sender;
            towerMode = (TowerBuildingMode)button.Tag;
        }

        private void ReleaseMonster()
        {
            if (Game.MonstersComing && Game.TicksNow - lastTimeMonsterCreated >= monsterCreationInterval)
            {
                if (currentMonsterIndex == currentLevel.MonsterSequence.Length)
                {
                    currentMonsterIndex = 0;
                }

                char monsterCode = currentLevel.MonsterSequence[currentMonsterIndex];
                Game.CreateMonster(monsterCode, currentLevel.Points);
                currentMonsterIndex++;
                monstersFiredOnThisLevel++;
                lastTimeMonsterCreated = Game.TicksNow;
                monsterCreationInterval = (long)(Game.TicksPerSecond * Util.RandomInRange(.5, 1.5));

                if (monstersFiredOnThisLevel == currentLevel.MonsterCount)
                {
                    Game.MonstersComing = false;
                }
            }
        }

        private void PauseButton_Click(object sender, RoutedEventArgs e)
        {
            if (Game.IsPlaying)
            {
                Game.PauseGame();
            }
            else
            {
                Game.ResumeGame();
            }
        }
    }
}
