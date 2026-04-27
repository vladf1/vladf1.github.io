import { Point } from "./Point";
import { Sprite } from "./Sprite";
import { Util } from "./Util";
import { Monster } from "./Monsters/Monster";
import { BallMonster } from "./Monsters/BallMonster";
import { SquareMonster } from "./Monsters/SquareMonster";
import { TriangleMonster } from "./Monsters/TriangleMonster";
import { ExplosionParticle } from "./Particles/ExplosionParticle";
import { Tower } from "./Towers/Tower";

export class Game {
  static readonly ticksPerSecond = 10000000;
  static readonly baseTicksPerFrame = Game.ticksPerSecond / 60;
  static readonly sprites: Sprite[] = [];
  static readonly towers: Tower[] = [];

  static monstersAllowedToEscape = 0;
  static canvasHeight = 450;
  static canvasWidth = 700;
  static currentFrameMonsters: Monster[] = [];
  static currentFrameMultiplier = 1;
  static ticksNow = 0;
  static monstersComing = false;
  static lastMonsterGone = false;
  static isPlaying = false;

  private static monstersKilled = 0;
  private static monstersEscaped = 0;
  private static money = 0;
  private static selectedTowerValue: Tower | null = null;

  static towerAnimation: Array<() => void> = [];
  static towerSelected: Array<(tower: Tower, towerWasSelectedBefore: boolean) => void> = [];
  static towerUnselected: Array<() => void> = [];
  static balanceChanged: Array<() => void> = [];
  static paused: Array<() => void> = [];
  static resumed: Array<() => void> = [];
  static monsterKilled: Array<(monster: Monster) => void> = [];
  static monsterEscaped: Array<(monster: Monster) => void> = [];

  static get selectedTower(): Tower | null {
    return Game.selectedTowerValue;
  }

  static set selectedTower(value: Tower | null) {
    Game.setSelectedTower(value);
  }

  static get balance(): number {
    return Game.money;
  }

  static resumeGame(): void {
    Game.isPlaying = true;
    Game.resumed.forEach((handler) => handler());
  }

  static pauseGame(): void {
    Game.isPlaying = false;
    Game.paused.forEach((handler) => handler());
  }

  static executeTowerAnimations(): void {
    const handlers = [...Game.towerAnimation];
    handlers.forEach((handler) => handler());
  }

  static setSelectedTower(value: Tower | null): void {
    const oldValue = Game.selectedTowerValue;
    Game.selectedTowerValue = value;
    if (Game.selectedTowerValue !== null) {
      Game.towerSelected.forEach((handler) => handler(Game.selectedTowerValue as Tower, oldValue !== null));
    } else if (oldValue !== null) {
      Game.towerUnselected.forEach((handler) => handler());
    }
  }

  static killMonster(monster: Monster): void {
    let interval = Util.calculateIntervalToComplete(0.4);
    for (let i = 0; i < 35; i += 1) {
      new ExplosionParticle(monster.x, monster.y, Math.floor(Util.randomInRange(2, 5)), monster.color, interval);
    }

    interval = Util.calculateIntervalToComplete(0.5);
    for (let i = 0; i < 35; i += 1) {
      new ExplosionParticle(monster.x, monster.y, Math.floor(Util.randomInRange(1, 4)), monster.color, interval);
    }

    Game.monstersKilled += 1;
    monster.markedForRemoval = true;
    Game.monsterKilled.forEach((handler) => handler(monster));
  }

  static escapeMonster(monster: Monster): void {
    const interval = Util.calculateIntervalToComplete(1);
    for (let i = 0; i < 150; i += 1) {
      new ExplosionParticle(monster.x, monster.y, Math.floor(Util.randomInRange(1, 4)), Util.createRandomColor(), interval);
    }
    Game.monstersEscaped += 1;
    monster.markedForRemoval = true;
    Game.monsterEscaped.forEach((handler) => handler(monster));
  }

  static createExplosionParticles(x: number, y: number, particleCount: number, particleSize: number, color: string, burnDown: number): void {
    for (let i = 0; i < particleCount; i += 1) {
      new ExplosionParticle(x, y, particleSize, color, burnDown);
    }
  }

  static resetBalance(amount: number): void {
    Game.money = amount;
    Game.balanceChanged.forEach((handler) => handler());
  }

  static deposit(amount: number): void {
    Game.money += amount;
    Game.balanceChanged.forEach((handler) => handler());
  }

  static withdraw(amount: number): boolean {
    if (amount > Game.money) {
      return false;
    }
    Game.money -= amount;
    Game.balanceChanged.forEach((handler) => handler());
    return true;
  }

  static clearField(): void {
    Game.monstersKilled = 0;
    Game.monstersEscaped = 0;
    Game.selectedTower = null;
    Game.towers.splice(0).forEach((tower) => tower.removeTowerFromCanvas());
    Game.sprites.splice(0).forEach((sprite) => sprite.removeFromCanvas());
  }

  static createRandomMonster(points: Point[]): void {
    const rand = Math.random();
    if (rand < 0.333) {
      Game.createMonster("b", points);
    } else if (rand < 0.666) {
      Game.createMonster("t", points);
    } else {
      Game.createMonster("s", points);
    }
  }

  static createMonster(code: string, points: Point[]): void {
    const start = points[0];
    switch (code) {
      case "b":
        new BallMonster(start.x, start.y, points);
        return;
      case "t":
        new TriangleMonster(start.x, start.y, points);
        return;
      default:
        new SquareMonster(start.x, start.y, points);
    }
  }
}
