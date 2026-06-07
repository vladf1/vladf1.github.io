import { Point } from "../Point";
import { Sprite } from "../Sprite";
import { Game } from "../Game";
import { Util } from "../Util";
import { Monster } from "../Monsters/Monster";
import { MissileTrail } from "./MissileTrail";

export class Missile extends Sprite {
  private static readonly intervalBetweenParticleGenerations = Game.ticksPerSecond * 0.02;
  private readonly damage: number;
  private readonly effectedRadius: number;
  private trackedMonster: Sprite | null;
  private speed: number;
  private angle: number;
  private lastFired = 0;

  constructor(source: Point, trackedSprite: Sprite, damageCaused: number, damageRadius: number, missileSpeed: number) {
    super();
    this.damage = damageCaused;
    this.trackedMonster = trackedSprite;
    this.effectedRadius = damageRadius;
    this.speed = missileSpeed;
    this.x = source.x;
    this.y = source.y;
    this.angle = Util.calculateAngle(this.x, this.y, trackedSprite.x, trackedSprite.y);
  }

  override animate(): void {
    this.speed += 0.05 * Game.currentFrameMultiplier;
    const velocity = Util.calculateLocation(this.angle, this.speed);
    this.dx = velocity.x;
    this.dy = velocity.y;
    this.updatePosition();

    if (this.isOutsideBounds) {
      this.trackedMonster = null;
      this.markedForRemoval = true;
      return;
    }

    if (this.trackedMonster === null || this.trackedMonster.markedForRemoval) {
      this.trackedMonster = null;
    }

    if (this.trackedMonster !== null) {
      this.angle = Util.calculateAngle(this.x, this.y, this.trackedMonster.x, this.trackedMonster.y);
    }

    if (Game.ticksNow - this.lastFired > Missile.intervalBetweenParticleGenerations) {
      const back = Util.calculateLocation(this.angle, -9);
      const x = this.x + Util.randomInRange(back.x - 3, back.x + 3);
      const y = this.y + Util.randomInRange(back.y - 3, back.y + 3);
      new MissileTrail(x, y);
      this.lastFired = Game.ticksNow;
    }

    for (const monster of Game.currentFrameMonsters) {
      if (Util.isWithinDistance(monster.x, monster.y, this.x, this.y, monster.radius + 6)) {
        this.markedForRemoval = true;
        const interval = Util.calculateIntervalToComplete(0.5);
        Game.createExplosionParticles(this.x, this.y, 20, 3, "#ffff00", interval);
        this.damageMonstersCloseBy(this.effectedRadius);
        break;
      }
    }
  }

  override render(context: CanvasRenderingContext2D): void {
    context.save();
    context.translate(this.x, this.y);
    context.rotate(this.angle);
    context.strokeStyle = "#ffff00";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(-6, 0);
    context.lineTo(6, 0);
    context.stroke();
    context.restore();
  }

  private damageMonstersCloseBy(range: number): void {
    for (const monster of Game.currentFrameMonsters) {
      if (Util.isWithinDistance(monster.x, monster.y, this.x, this.y, range)) {
        const distance = Util.calculateDistance(monster.x, monster.y, this.x, this.y);
        const ratio = (range - distance) / range;
        monster.takeDamage(this.damage * ratio);
      }
    }
  }
}
