import { BoardElement } from "../BoardElement";
import { Game } from "../Game";
import { Point } from "../Point";
import { Sprite } from "../Sprite";
import { Stopwatch } from "../Stopwatch";
import { Monster } from "../Monsters/Monster";
import { Util } from "../Util";

export abstract class Tower extends BoardElement {
  static readonly towerRadius = 10;
  static readonly maxLevel = 6;
  protected static readonly toolbarAnimationRotationStep = 0.052359877559829883;

  private paused = false;
  private stopwatch: Stopwatch | null = null;
  level = 0;
  cost = 0;
  range = 0;
  protected millisecondsBetweenFiring = 0;

  protected constructor(x: number, y: number, addToGame = true) {
    super();
    this.x = x;
    this.y = y;
    if (addToGame) {
      Game.towers.push(this);
      Game.withdraw(this.cost);
      Game.towerAnimation.push(this.animateBound);
      Game.paused.push(this.gamePausedBound);
      Game.resumed.push(this.gameResumedBound);
    }
  }

  protected get canFireNow(): boolean {
    return this.stopwatch === null || this.stopwatch.elapsedMilliseconds >= this.millisecondsBetweenFiring;
  }

  abstract render(context: CanvasRenderingContext2D): void;

  upgrade(): void {
    if (this.level < Tower.maxLevel) {
      this.level += 1;
      this.upgradeWork(this.level);
      this.cost += 50;
    }
  }

  removeTowerFromCanvas(): void {
    Game.towerAnimation = Game.towerAnimation.filter((handler) => handler !== this.animateBound);
    Game.paused = Game.paused.filter((handler) => handler !== this.gamePausedBound);
    Game.resumed = Game.resumed.filter((handler) => handler !== this.gameResumedBound);
  }

  containsPoint(x: number, y: number): boolean {
    return Util.isWithinDistance(this.x, this.y, x, y, Tower.towerRadius + 4);
  }

  protected static calculateWhereToShoot(source: Point, enemy: Sprite, bulletSpeed: number): Point {
    const target = new Point(enemy.x - source.x, enemy.y - source.y);
    const a = (bulletSpeed * bulletSpeed) - ((enemy.dx * enemy.dx) + (enemy.dy * enemy.dy));
    const b = (target.x * enemy.dx) + (target.y * enemy.dy);
    const c = (target.x * target.x) + (target.y * target.y);
    const d = (b * b) + (a * c);
    let t = 0;
    if (d >= 0 && a !== 0) {
      t = (b + Math.sqrt(d)) / a;
      if (t < 0) {
        t = 0;
      }
    }
    return new Point(enemy.x + (enemy.dx * t), enemy.y + (enemy.dy * t));
  }

  protected abstract animate(): void;

  protected timeFiring(): void {
    this.stopwatch = Stopwatch.startNew();
  }

  protected animateToolboxRendering(): void {}

  protected getClosestMonsterInRange(): Monster | null {
    let smallestDistance = Number.MAX_VALUE;
    let closestMonster: Monster | null = null;
    const fireRangeSquared = this.range * this.range;

    for (const monster of Game.currentFrameMonsters) {
      if (monster.markedForRemoval) {
        continue;
      }
      const distSquared = Util.getDistanceSquared(this.x, this.y, monster.x, monster.y, this.range, fireRangeSquared);
      if (distSquared === -1) {
        continue;
      }
      if (distSquared < smallestDistance) {
        closestMonster = monster;
        smallestDistance = distSquared;
      }
    }
    return closestMonster;
  }

  protected upgradeWork(newLevel: number): void {
    this.range += newLevel * 4;
  }

  protected drawBaseCircle(context: CanvasRenderingContext2D, fillOuter: string, fillInner = "#000"): void {
    const gradient = context.createRadialGradient(this.x, this.y, 1, this.x, this.y, Tower.towerRadius);
    gradient.addColorStop(0, fillOuter);
    gradient.addColorStop(1, fillInner);
    context.fillStyle = gradient;
    context.strokeStyle = "#fff";
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(this.x, this.y, Tower.towerRadius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }

  private readonly animateBound = (): void => this.animate();
  private readonly gamePausedBound = (): void => this.gamePaused();
  private readonly gameResumedBound = (): void => this.gameResumed();

  private gamePaused(): void {
    if (this.stopwatch !== null) {
      this.paused = true;
      this.stopwatch.stop();
    }
  }

  private gameResumed(): void {
    if (this.paused && this.stopwatch !== null) {
      this.paused = false;
      this.stopwatch.start();
    }
  }
}
