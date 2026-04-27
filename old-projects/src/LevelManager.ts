import { LevelInfo } from "./LevelInfo";
import { Point } from "./Point";

export class LevelManager {
  static readonly levels: LevelInfo[] = [
    LevelManager.create("Bellingham", 80, 10, "bbbsssttt", [[100, 0], [100, 250], [350, 250], [200, 100], [350, 100], [600, 350], [100, 350]]),
    LevelManager.create("Everett", 65, 10, "bst", [[100, 0], [100, 300], [300, 300], [300, 150], [600, 150]]),
    LevelManager.create("Seattle", 60, 10, "bs", [[100, 0], [100, 100], [600, 200], [150, 350]]),
    LevelManager.create("Tacoma", 50, 10, "ttb", [[200, 0], [200, 300], [500, 300], [500, 100]]),
    LevelManager.create("Olympia", 11, 3, "bst", [[350, 0], [350, 350]]),
  ];

  private static create(name: string, monsterCount: number, allowEscape: number, sequence: string, points: number[][]): LevelInfo {
    const level = new LevelInfo();
    level.name = name;
    level.monsterCount = monsterCount;
    level.monstersAllowedEscape = allowEscape;
    level.monsterSequence = sequence;
    level.points = points.map(([x, y]) => new Point(x, y));
    return level;
  }
}
