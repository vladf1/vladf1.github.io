import { Game } from "../Game";
import { Util } from "../Util";
import { SlowingIndicator } from "../Particles/SlowingIndicator";
import { Tower } from "./Tower";

export class SlowingTower extends Tower {
  private static readonly slowDownTo = 0.5;

  constructor(x: number, y: number, addToGame = true) {
    super(x, y, addToGame);
    this.cost = 30;
    this.range = 70;
    this.millisecondsBetweenFiring = 1000;
  }

  override render(context: CanvasRenderingContext2D): void {
    const pulse = (Math.sin(performance.now() / 500) + 1) / 2;
    const yellow = Math.round(255 * pulse);
    const gradient = context.createRadialGradient(this.x, this.y, 1, this.x, this.y, Tower.towerRadius);
    gradient.addColorStop(0, "#000");
    gradient.addColorStop(0.9, `rgb(${yellow},${yellow},0)`);
    context.save();
    context.fillStyle = gradient;
    context.strokeStyle = "#fff";
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(this.x, this.y, Tower.towerRadius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
  }

  protected override animate(): void {
    if (this.canFireNow) {
      const monstersToAffect = Game.currentFrameMonsters
        .filter((monster) => Util.isMonsterWithinDistance(monster, this.x, this.y, this.range))
        .slice(0, this.level + 2);
      for (const monster of monstersToAffect) {
        monster.slowDown(SlowingTower.slowDownTo);
        new SlowingIndicator(this.x, this.y, monster);
      }
      this.timeFiring();
    }
  }
}
