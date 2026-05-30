using System;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using VectorDefenceSL.Particles;

namespace VectorDefenceSL.Towers
{
    public class SlowingTower : Tower
    {
        private const double SlowDownTo = .5;

        private readonly Storyboard storyboard = new Storyboard();
        private readonly GradientStop startGradient = new GradientStop { Color = Colors.Black, Offset = 0 };
        private readonly GradientStop endGradient = new GradientStop { Color = Colors.Yellow, Offset = .9 };
        private readonly ColorAnimationUsingKeyFrames animation = new ColorAnimationUsingKeyFrames { RepeatBehavior = RepeatBehavior.Forever };

        private readonly Ellipse torrent = new Ellipse
        {
            StrokeThickness = 1.5,
            Stroke = new SolidColorBrush(Colors.White),
            Width = TowerRadius * 2,
            Height = TowerRadius * 2
        };

        public SlowingTower(Button btn) : base(btn, TowerBuildingMode.SlowingTower)
        {
            torrent.Fill = new RadialGradientBrush(new GradientStopCollection { startGradient, endGradient });
            ConfigureAnimation();
            storyboard.Pause();
            btn.MouseEnter += delegate
            {
                if (Game.IsPlaying)
                {
                    storyboard.Resume();
                }
            };
            btn.MouseLeave += delegate
            {
                storyboard.Pause();
            };
        }

        public SlowingTower(double x, double y) : base(x, y)
        {
            torrent.Fill = new RadialGradientBrush(new GradientStopCollection { startGradient, endGradient });
            Cost = 30;
            Range = 70;
            MillisecondsBetweenFiring = 1000;
            torrent.MouseLeftButtonDown += HandleTowerSelection;
            ConfigureAnimation();
            Game.Paused += storyboard.Pause;
            Game.Resumed += storyboard.Resume;
        }

        public override sealed void Render()
        {
            torrent.SetCanvasPosition(X - TowerRadius, Y - TowerRadius);
            Container.Children.Add(torrent);
        }

        public override void RemoveTowerFromCanvas()
        {
            base.RemoveTowerFromCanvas();
            Container.Children.Remove(torrent);
            Game.Paused -= storyboard.Pause;
            Game.Resumed -= storyboard.Resume;
        }

        protected override void Animate()
        {
            if (CanFireNow)
            {
                var monstersCloseBy = Game.CurrentFrameMonsters.Where(m => m.IsWithinDistance(X, Y, Range));
                var monstersToAffect = monstersCloseBy.Take(Level + 2).ToArray();
                foreach (var m in monstersToAffect)
                {
                    m.SlowDown(SlowDownTo);
                    new SlowingIndicator(X, Y, m);
                }
                TimeFiring();
            }
        }

        private void ConfigureAnimation()
        {
            animation.KeyFrames.Add(new LinearColorKeyFrame { Value = Colors.Black, KeyTime = KeyTime.FromTimeSpan(TimeSpan.FromSeconds(.5)) });
            animation.KeyFrames.Add(new LinearColorKeyFrame { Value = Colors.Yellow, KeyTime = KeyTime.FromTimeSpan(TimeSpan.FromSeconds(1.0)) });
            Storyboard.SetTarget(animation, endGradient);
            Storyboard.SetTargetProperty(animation, new PropertyPath(GradientStop.ColorProperty));
            storyboard.Children.Add(animation);
            torrent.Resources.Add("s", storyboard);
            storyboard.Begin();
        }
    }
}
