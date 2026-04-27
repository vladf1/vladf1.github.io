import { LevelInfo } from "./LevelInfo";
import levelsXml from "./Levels.xml?raw";
import { Point } from "./Point";

export class LevelManager {
  static readonly levels: LevelInfo[] = LevelManager.parseLevels(levelsXml);

  private static parseLevels(xml: string): LevelInfo[] {
    const document = new DOMParser().parseFromString(xml, "application/xml");
    const parserError = document.querySelector("parsererror");
    if (parserError !== null) {
      throw new Error("Levels.xml could not be parsed.");
    }

    const levels: LevelInfo[] = [];
    for (const element of Array.from(document.querySelectorAll("level"))) {
      levels.push(LevelManager.loadSingleLevel(element));
    }
    return levels;
  }

  private static loadSingleLevel(element: Element): LevelInfo {
    const level = new LevelInfo();
    level.name = element.getAttribute("name") ?? "";

    for (const point of Array.from(element.querySelectorAll("p"))) {
      const x = Number(point.getAttribute("x"));
      const y = Number(point.getAttribute("y"));
      level.points.push(new Point(x, y));
    }

    const monsters = element.querySelector("monsters");
    if (monsters !== null) {
      level.monsterCount = Number(monsters.getAttribute("count"));
      level.monstersAllowedEscape = Number(monsters.getAttribute("allowEscape"));
      level.monsterSequence = monsters.textContent ?? "";
    }

    return level;
  }
}
