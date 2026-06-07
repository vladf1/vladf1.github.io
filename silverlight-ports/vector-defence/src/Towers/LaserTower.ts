import { Point } from "../Point";
import { Game } from "../Game";
import { Util } from "../Util";
import { LaserRay } from "../Particles/LaserRay";
import { Monster } from "../Monsters/Monster";
import { Tower } from "./Tower";

export class LaserTower extends Tower {
  private readonly ray = new LaserRay();
  private trackedMonster: Monster | null = null;
  private gunTip = new Point(0, 0);
  private gunAngle = 0;

  constructor(x: number, y: number, addToGame = true) {
    super(x, y, addToGame);
    this.cost = 30;
    this.range = 100;
    this.millisecondsBetweenFiring = 1500;
    this.gunAngle = Util.randomInRange(-Math.PI, Math.PI);
    this.turnGun();
  }

  override removeTowerFromCanvas(): void {
    super.removeTowerFromCanvas();
    this.ray.markedForRemoval = true;
  }

  override render(context: CanvasRenderingContext2D): void {
    this.turnGun();
    context.save();
    context.fillStyle = "#000";
    context.beginPath();
    context.arc(this.x, this.y, 12.5, 0, Math.PI * 2);
    context.fill();
    context.translate(this.x, this.y);
    context.rotate(this.gunAngle);
    context.fillStyle = "#00ffff";
    context.strokeStyle = "#fff";
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(-10, 5);
    context.lineTo(-2, 4);
    context.lineTo(10, 0);
    context.lineTo(-2, -4);
    context.lineTo(-10, -5);
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();
  }

  protected override animate(): void {
    if (this.trackedMonster === null || this.trackedMonster.markedForRemoval) {
      this.trackedMonster = this.getClosestMonsterInRange();
    }

    if (this.trackedMonster !== null) {
      const closeEnough = Util.isWithinDistance(this.trackedMonster.x, this.trackedMonster.y, this.x, this.y, this.range);
      if (!closeEnough || this.trackedMonster.markedForRemoval) {
        this.trackedMonster = null;
      } else {
        const sourcePoint = this.gunTip.clone();
        if (this.ray.isOn) {
          const target = this.turnGunToTrackedMonster();
          this.ray.turnTo(sourcePoint, target);
        }
        if (this.canFireNow) {
          const target = this.turnGunToTrackedMonster();
          this.ray.fireAt(sourcePoint, target);
          this.timeFiring();
        }
      }
    }
  }

  protected override upgradeWork(newLevel: number): void {
    super.upgradeWork(newLevel);
    this.ray.setLevel(newLevel);
  }

  private turnGunToTrackedMonster(): Point {
    const target = new Point(this.trackedMonster?.x ?? this.x, this.trackedMonster?.y ?? this.y);
    this.gunAngle = Util.calculateAngle(this.x, this.y, target.x, target.y);
    this.turnGun();
    return target;
  }

  private turnGun(): void {
    this.gunTip = new Point(
      this.x + (9 * Math.cos(this.gunAngle)),
      this.y + (9 * Math.sin(this.gunAngle)),
    );
  }
}
