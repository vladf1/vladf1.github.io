import { Point } from "../Point";
import { Game } from "../Game";
import { Util } from "../Util";
import { Projectile } from "../Particles/Projectile";
import { Monster } from "../Monsters/Monster";
import { Tower } from "./Tower";

export class GunTower extends Tower {
  private static readonly gunLength = 16;
  private trackedMonster: Monster | null = null;
  private gunAngle = 0;
  private gunThickness = 2;

  constructor(x: number, y: number, addToGame = true) {
    super(x, y, addToGame);
    this.cost = 20;
    this.range = 60;
    this.millisecondsBetweenFiring = 200;
    this.gunAngle = Util.randomInRange(-Math.PI, Math.PI);
  }

  override render(context: CanvasRenderingContext2D): void {
    const end = this.gunEnd();
    this.drawBaseCircle(context, "#fff");
    context.save();
    context.strokeStyle = "#fff";
    context.lineWidth = this.gunThickness;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(this.x, this.y);
    context.lineTo(end.x, end.y);
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
        const source = this.gunEnd();
        const target = Tower.calculateWhereToShoot(source, this.trackedMonster, Projectile.speed);
        this.gunAngle = Util.calculateAngle(this.x, this.y, target.x, target.y);

        if (this.canFireNow) {
          const damageCaused = 10 + this.level;
          const size = 3 + (this.level / 2);
          new Projectile(source, target, damageCaused, size);
          this.timeFiring();
        }
      }
    }
  }

  protected override upgradeWork(newLevel: number): void {
    super.upgradeWork(newLevel);
    this.gunThickness = 2 + (newLevel / 2);
  }

  private gunEnd(): Point {
    return new Point(
      this.x + (GunTower.gunLength * Math.cos(this.gunAngle)),
      this.y + (GunTower.gunLength * Math.sin(this.gunAngle)),
    );
  }
}
