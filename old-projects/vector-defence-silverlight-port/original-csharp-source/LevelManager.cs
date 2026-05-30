using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Resources;
using System.Xml;

namespace VectorDefenceSL
{
    public static class LevelManager
    {
        private static readonly List<LevelInfo> listOfLevels = new List<LevelInfo>();

        static LevelManager()
        {
            StreamResourceInfo sr = Application.GetResourceStream(new Uri("Levels.xml", UriKind.Relative));
            using (XmlReader reader = XmlReader.Create(sr.Stream))
            {
                while (reader.Read())
                {
                    if (reader.NodeType == XmlNodeType.Element && reader.Name == "level")
                    {
                        var level = LoadSingleLevel(reader);
                        listOfLevels.Add(level);
                    }
                }
            }
        }

        public static List<LevelInfo> Levels
        {
            get { return listOfLevels; }
        }

        private static LevelInfo LoadSingleLevel(XmlReader r)
        {
            var level = new LevelInfo { Name = r.GetAttribute("name") };
            while (r.Read())
            {
                if (r.NodeType == XmlNodeType.Element && r.Name == "p")
                {
                    double x = Convert.ToDouble(r.GetAttribute("x"));
                    double y = Convert.ToDouble(r.GetAttribute("y"));
                    level.Points.Add(new Point(x, y));
                }
                if (r.NodeType == XmlNodeType.Element && r.Name == "monsters")
                {
                    level.MonsterCount = Convert.ToInt32(r.GetAttribute("count"));
                    level.MonstersAllowedEscape = Convert.ToInt32(r.GetAttribute("allowEscape"));
                    level.MonsterSequence = r.ReadElementContentAsString();
                }
                if (r.NodeType == XmlNodeType.EndElement && r.Name == "level")
                {
                    break;
                }
            }
            return level;
        }
    }
}
