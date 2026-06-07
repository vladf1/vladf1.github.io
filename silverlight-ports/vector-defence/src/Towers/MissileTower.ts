import { Point } from "../Point";
import { Game } from "../Game";
import { Missile } from "../Particles/Missile";
import { Tower } from "./Tower";

export class MissileTower extends Tower {
  private angle = 45;
  private rotationSpeed = 0;
  private missileDamage = 0;

  constructor(x: number, y: number, addToGame = true) {
    super(x, y, addToGame);
    this.cost = 50;
    this.range = 150;
    this.setLevel();
  }

  override render(context: CanvasRenderingContext2D): void {
    context.save();
    context.translate(this.x, this.y);
    context.rotate(this.angle * Math.PI / 180);
    const gradient = context.createRadialGradient(0, 0, 1, 0, 0, Tower.towerRadius);
    gradient.addColorStop(0, "#ffff00");
    gradient.addColorStop(1, "#000");
    context.fillStyle = gradient;
    context.strokeStyle = "#fff";
    context.lineWidth = 1.5;
    context.fillRect(-Tower.towerRadius, -Tower.towerRadius, Tower.towerRadius * 2, Tower.towerRadius * 2);
    context.strokeRect(-Tower.towerRadius, -Tower.towerRadius, Tower.towerRadius * 2, Tower.towerRadius * 2);
    context.restore();
  }

  protected override animate(): void {
    this.angle += this.rotationSpeed * Game.currentFrameMultiplier;
    const monster = this.getClosestMonsterInRange();
    if (monster !== null && this.canFireNow) {
      const damageRadius = 60 + (5 * this.level);
      const missileSpeed = 1.8 + (this.level / 2);
      new Missile(new Point(this.x, this.y), monster, this.missileDamage, damageRadius, missileSpeed);
      this.timeFiring();
    }
  }

  protected override upgradeWork(newLevel: number): void {
    super.upgradeWork(newLevel);
    this.setLevel();
  }

  private setLevel(): void {
    this.millisecondsBetweenFiring = 1000 * (2 - (0.2 * this.level));
    this.rotationSpeed = 0.5 + (this.level / 3);
    this.missileDamage = 50 + (4 * this.level);
  }
}
