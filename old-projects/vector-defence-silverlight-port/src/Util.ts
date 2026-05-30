import { Point } from "./Point";
import { TowerBuildingMode } from "./TowerBuildingMode";
import type { Monster } from "./Monsters/Monster";

export class Util {
  static randomInRange(minVal: number, maxVal: number): number {
    return minVal + (Math.random() * (maxVal - minVal));
  }

  static calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
    const xdiff = x2 - x1;
    const ydiff = y2 - y1;
    return Math.sqrt((xdiff * xdiff) + (ydiff * ydiff));
  }

  static calculateLocation(angle: number, distance: number): Point {
    return new Point(distance * Math.cos(angle), distance * Math.sin(angle));
  }

  static calculateAngle(sourceX: number, sourceY: number, targetX: number, targetY: number): number {
    return Math.atan2(targetY - sourceY, targetX - sourceX);
  }

  static getDistanceSquared(x1: number, y1: number, x2: number, y2: number, minDistance: number, minDistanceSquared: number): number {
    if (Math.abs(x1 - x2) > minDistance || Math.abs(y1 - y2) > minDistance) {
      return -1;
    }
    const underRadical = ((x2 - x1) ** 2) + ((y2 - y1) ** 2);
    return minDistanceSquared < underRadical ? -1 : underRadical;
  }

  static isWithinDistance(x1: number, y1: number, x2: number, y2: number, distance: number): boolean {
    if (Math.abs(x1 - x2) > distance || Math.abs(y1 - y2) > distance) {
      return false;
    }
    return (distance * distance) > (((x2 - x1) ** 2) + ((y2 - y1) ** 2));
  }

  static isMonsterWithinDistance(m: Monster, x: number, y: number, distance: number): boolean {
    return Util.isWithinDistance(m.x, m.y, x, y, distance);
  }

  static calculateIntervalToComplete(seconds: number): number {
    return 1 / seconds / 60;
  }

  static isWithinDistanceToSegment(x1: number, y1: number, x2: number, y2: number, pointX: number, pointY: number, distance: number): boolean {
    const px = x2 - x1;
    const py = y2 - y1;
    let u = (((pointX - x1) * px) + ((pointY - y1) * py)) / ((px * px) + (py * py));
    u = (u > 1) ? 1 : (u < 0) ? 0 : u;
    const x = x1 + (u * px);
    const y = y1 + (u * py);
    const dx = x - pointX;
    const dy = y - pointY;
    return (distance * distance) > ((dx * dx) + (dy * dy));
  }

  static getAngleInDegrees(angle: number): number {
    return angle * (180 / Math.PI);
  }

  static getTowerRange(towerMode: TowerBuildingMode): number {
    switch (towerMode) {
      case TowerBuildingMode.GunTower:
        return 60;
      case TowerBuildingMode.LaserTower:
        return 100;
      case TowerBuildingMode.MissileTower:
        return 150;
      default:
        return 70;
    }
  }

  static createRandomColor(): string {
    const r = Math.floor(Util.randomInRange(50, 255));
    const g = Math.floor(Util.randomInRange(50, 255));
    const b = Math.floor(Util.randomInRange(50, 255));
    return `rgb(${r},${g},${b})`;
  }
}
