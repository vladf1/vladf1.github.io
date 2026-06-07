using System.Windows.Media;

namespace VectorDefenceSL
{
    public class LevelInfo
    {
        public LevelInfo()
        {
            Points = new PointCollection();
        }

        public string Name { get; set; }

        public int MonsterCount { get; set; }

        public int MonstersAllowedEscape { get; set; }

        public string MonsterSequence { get; set; }

        public PointCollection Points { get; private set; }
    }
}