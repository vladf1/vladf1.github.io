using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media.Animation;

namespace VectorDefenceSL
{
    public partial class LevelSelector
    {
        private readonly Popup popup;
        private readonly Action<LevelInfo> handler;
        private LevelInfo levelToOpen;

        public LevelSelector(Popup opener, Action<LevelInfo> openLevel) : this()
        {
            popup = opener;
            handler = openLevel;
            var style = (Style)Application.Current.Resources["FlatButton"];
            for (var i = 0; i < LevelManager.Levels.Count; i++)
            {
                var level = LevelManager.Levels[i];
                var button = new Button
                {
                    Content = level.Name,
                    Width = Width - 60,
                    Style = style,
                    Margin = new Thickness { Bottom = 15 }
                };
                stackPanel.Children.Add(button);
                button.Click += delegate
                {
                    if (fadeDialogStoryboard.GetCurrentState() == ClockState.Stopped)
                    {
                        levelToOpen = level;
                        fadeDialogStoryboard.Begin();
                    }
                };
            }
        }

        public LevelSelector()
        {
            InitializeComponent();
        }

        public double EstimatedHeight
        {
            get
            {
                return (61 * LevelManager.Levels.Count) + stackPanel.Margin.Top + stackPanel.Margin.Bottom;
            }
        }

        private void HideAnimation_Completed(object sender, EventArgs e)
        {
            popup.IsOpen = false;
            handler(levelToOpen);
        }
    }
}
