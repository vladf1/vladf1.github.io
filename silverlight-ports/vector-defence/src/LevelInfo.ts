import { Point } from "./Point";

export class LevelInfo {
  name = "";
  monsterCount = 0;
  monstersAllowedEscape = 0;
  monsterSequence = "";
  points: Point[] = [];
}
