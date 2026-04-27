import { Game } from "./Game";
import { LevelInfo } from "./LevelInfo";
import { LevelManager } from "./LevelManager";
import { Point } from "./Point";
import { TowerBuildingMode } from "./TowerBuildingMode";
import { Util } from "./Util";
import { LevelSelector } from "./LevelSelector";
import { CanvasButton } from "./ui/CanvasButton";
import { LaserRay } from "./Particles/LaserRay";
import { Monster } from "./Monsters/Monster";
import { Tower } from "./Towers/Tower";
import { GunTower } from "./Towers/GunTower";
import { LaserTower } from "./Towers/LaserTower";
import { MissileTower } from "./Towers/MissileTower";
import { SlowingTower } from "./Towers/SlowingTower";

export class MainPage {
  private monsterCreationInterval = 0;
  private lastTimeMonsterCreated = 0;
  private lastAnimated = 0;
  private towerMode = TowerBuildingMode.GunTower;
  private currentLevel: LevelInfo | null = null;
  private currentMonsterIndex = 0;
  private monstersFiredOnThisLevel = 0;
  private mouse = new Point(-1, -1);
  private levelNameText = "";
  private levelNameElapsed = 0;
  private levelNameVisible = false;
  private selectedTower: Tower | null = null;
  private showTowerTypes = false;
  private showTowerActions = false;
  private towerTypesOpacity = 0;
  private towerActionsOpacity = 0;
  private selectedRangeTower: Tower | null = null;
  private selectedRangeOpacity = 0;
  private levelSelector: LevelSelector;
  private readonly buttons: CanvasButton[] = [];
  private pressedButton: CanvasButton | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly context: CanvasRenderingContext2D,
  ) {
    Game.canvasWidth = 700;
    Game.canvasHeight = 450;
    this.levelSelector = new LevelSelector((level) => this.loadLevel(level));
    this.configureButtons();
    this.bindEvents();

    Game.towerSelected.push((tower, towerWasSelectedBefore) => this.gameTowerSelected(tower, towerWasSelectedBefore));
    Game.towerUnselected.push(() => this.gameTowerUnselected());
    Game.monsterKilled.push((monster) => this.gameMonsterKilled(monster));
    Game.monsterEscaped.push((monster) => this.gameMonsterEscaped(monster));
    Game.resumed.push(() => this.updatePauseButton());
    Game.paused.push(() => this.updatePauseButton());

    requestAnimationFrame((now) => this.renderFrame(now));
  }

  private configureButtons(): void {
    const towerX = (700 - 214) / 2;
    const names: Array<[string, TowerBuildingMode]> = [
      ["Gun", TowerBuildingMode.GunTower],
      ["Laser", TowerBuildingMode.LaserTower],
      ["Missile", TowerBuildingMode.MissileTower],
      ["Slow", TowerBuildingMode.SlowingTower],
    ];
    for (let i = 0; i < names.length; i += 1) {
      const [label, mode] = names[i];
      const button = new CanvasButton(towerX + (i * 56), 465, 46, 46, label, () => {
        this.towerMode = mode;
        Game.selectedTower = null;
      });
      button.showLabel = false;
      this.buttons.push(button);
    }

    const actionX = (700 - 267) / 2;
    this.buttons.push(new CanvasButton(actionX, 465, 100, 46, "sell", () => this.sellTower()));
    this.buttons.push(new CanvasButton(actionX + 110, 465, 157, 46, "upgrade", () => this.upgradeTower()));
    this.buttons.push(new CanvasButton(12, 465, 59, 46, "||", () => this.pauseButtonClick()));
  }

  private bindEvents(): void {
    this.canvas.addEventListener("mousemove", (event) => {
      this.mouse = this.getCanvasPoint(event);
    });
    this.canvas.addEventListener("mouseleave", () => {
      this.mouse = new Point(-1, -1);
    });
    this.canvas.addEventListener("mousedown", (event) => {
      const point = this.getCanvasPoint(event);
      const button = this.findVisibleButton(point);
      if (button !== undefined) {
        this.pressedButton = button;
        return;
      }
      this.canvasMouseLeftButtonDown(point);
    });
    window.addEventListener("mouseup", (event) => {
      if (this.pressedButton !== null && event instanceof MouseEvent) {
        const point = this.getCanvasPoint(event);
        if (this.pressedButton.contains(point.x, point.y)) {
          this.pressedButton.action();
        }
      }
      this.pressedButton = null;
    });
    window.addEventListener("keydown", (event) => this.handleKey(event));
  }

  private renderFrame(now: number): void {
    Game.ticksNow = now * 10000;
    if (this.lastAnimated !== 0) {
      const timeBetweenFrames = Game.ticksNow - this.lastAnimated;
      Game.currentFrameMultiplier = Math.max(0.1, Math.min(4, timeBetweenFrames / Game.baseTicksPerFrame));
    }
    this.lastAnimated = Game.ticksNow;

    if (Game.isPlaying) {
      this.releaseMonster();
      const spritesCopy = [...Game.sprites];
      Game.currentFrameMonsters = spritesCopy.filter((sprite): sprite is Monster => sprite instanceof Monster && !sprite.markedForRemoval);
      Game.sprites.length = 0;
      for (const sprite of spritesCopy) {
        sprite.animate();
        if (!sprite.markedForRemoval) {
          Game.sprites.push(sprite);
        }
      }
      Game.executeTowerAnimations();
      if (Game.lastMonsterGone) {
        const spritesLeft = Game.sprites.some((sprite) => !(sprite instanceof LaserRay) && !sprite.markedForRemoval);
        if (!spritesLeft) {
          this.loadRandomLevel();
        }
      }
    }

    if (this.levelNameVisible) {
      this.levelNameElapsed += Game.currentFrameMultiplier / 60;
      if (this.levelNameElapsed > 1.5) {
        this.levelNameVisible = false;
        Game.monstersComing = true;
      }
    }

    this.updateOpacityAnimations();
    this.levelSelector.update(Game.currentFrameMultiplier);
    this.render();
    requestAnimationFrame((next) => this.renderFrame(next));
  }

  private render(): void {
    this.drawRootBackground();
    this.drawPlayfield();
    this.drawSelectedTowerRangeIndicator();
    this.drawPath();
    this.drawFinalPoint();
    this.drawFutureTowerIndicators();
    for (const sprite of Game.sprites) {
      sprite.render(this.context);
    }
    for (const tower of Game.towers) {
      tower.render(this.context);
    }
    this.drawTowerSelectionIndicator();
    this.drawLevelName();
    this.drawBottomUi();
    this.levelSelector.render(this.context, this.mouse.x, this.mouse.y);
  }

  private startPlaying(): void {
    this.showTowerTypes = true;
    this.showTowerActions = false;
    this.towerTypesOpacity = 1;
    this.towerActionsOpacity = 0;
    this.buttons.forEach((button) => {
      button.visible = true;
    });
  }

  private loadLevel(level: LevelInfo): void {
    if (!Game.isPlaying) {
      this.startPlaying();
      Game.resumeGame();
    }
    Game.lastMonsterGone = false;
    Game.monstersComing = false;
    Game.clearField();
    Game.resetBalance(2000);
    this.levelNameText = level.name;
    this.levelNameVisible = true;
    this.levelNameElapsed = 0;
    this.currentLevel = level;
    Game.monstersAllowedToEscape = level.monstersAllowedEscape;
    this.currentMonsterIndex = 0;
    this.monstersFiredOnThisLevel = 0;
    this.lastTimeMonsterCreated = 0;
    this.monsterCreationInterval = 0;
    this.towerMode = TowerBuildingMode.GunTower;
  }

  private checkForLastMonsterOnTheLevel(): void {
    if (!Game.monstersComing) {
      const monstersLeft = Game.currentFrameMonsters.some((monster) => !monster.markedForRemoval);
      Game.lastMonsterGone = !monstersLeft;
    }
  }

  private gameTowerSelected(tower: Tower, towerWasSelectedBefore: boolean): void {
    this.selectedTower = tower;
    this.selectedRangeTower = tower;
    if (!towerWasSelectedBefore) {
      this.showTowerTypes = false;
      this.showTowerActions = true;
    }
    this.towerMode = TowerBuildingMode.None;
  }

  private gameTowerUnselected(): void {
    this.selectedTower = null;
    this.showTowerTypes = true;
    this.showTowerActions = false;
  }

  private gameMonsterEscaped(monster: Monster): void {
    Game.monstersAllowedToEscape -= 1;
    if (Game.monstersAllowedToEscape < 0) {
      for (const current of Game.currentFrameMonsters) {
        current.markedForRemoval = true;
      }
      Game.monstersComing = false;
    }
    this.checkForLastMonsterOnTheLevel();
  }

  private gameMonsterKilled(monster: Monster): void {
    Game.deposit(monster.bounty);
    this.checkForLastMonsterOnTheLevel();
  }

  private loadRandomLevel(): void {
    const index = Math.floor(Math.random() * LevelManager.levels.length);
    this.loadLevel(LevelManager.levels[index]);
  }

  private validateTowerPosition(pos: Point): boolean {
    if (this.currentLevel === null) {
      return false;
    }
    const outsideBounds = pos.x < Tower.towerRadius || pos.y < Tower.towerRadius || pos.x > Game.canvasWidth - Tower.towerRadius || pos.y > Game.canvasHeight - Tower.towerRadius;
    if (outsideBounds) {
      return false;
    }
    if (Game.towers.some((tower) => Util.isWithinDistance(tower.x, tower.y, pos.x, pos.y, 32))) {
      return false;
    }
    for (let i = 0; i < this.currentLevel.points.length - 1; i += 1) {
      const p1 = this.currentLevel.points[i];
      const p2 = this.currentLevel.points[i + 1];
      if (Util.isWithinDistanceToSegment(p1.x, p1.y, p2.x, p2.y, pos.x, pos.y, 20)) {
        return false;
      }
    }
    return true;
  }

  private placeNewTower(pos: Point): Tower {
    switch (this.towerMode) {
      case TowerBuildingMode.GunTower:
        return new GunTower(pos.x, pos.y);
      case TowerBuildingMode.LaserTower:
        return new LaserTower(pos.x, pos.y);
      case TowerBuildingMode.MissileTower:
        return new MissileTower(pos.x, pos.y);
      default:
        return new SlowingTower(pos.x, pos.y);
    }
  }

  private canvasMouseLeftButtonDown(pos: Point): void {
    if (this.levelSelector.handleClick(pos.x, pos.y)) {
      return;
    }
    if (pos.y <= Game.canvasHeight) {
      const clickedTower = [...Game.towers].reverse().find((tower) => tower.containsPoint(pos.x, pos.y));
      if (clickedTower !== undefined) {
        Game.selectedTower = clickedTower;
        return;
      }
      if (this.currentLevel !== null && this.towerMode !== TowerBuildingMode.None && this.validateTowerPosition(pos)) {
        const newTower = this.placeNewTower(pos);
        Game.withdraw(newTower.cost);
        this.towerMode = TowerBuildingMode.None;
      } else {
        Game.selectedTower = null;
      }
    }
  }

  private sellTower(): void {
    const tower = Game.selectedTower;
    if (tower !== null) {
      Game.deposit(Math.floor(tower.cost * 0.75));
      Game.towers.splice(Game.towers.indexOf(tower), 1);
      tower.removeTowerFromCanvas();
      Game.selectedTower = null;
    }
  }

  private upgradeTower(): void {
    if (Game.selectedTower !== null && Game.selectedTower.level !== Tower.maxLevel) {
      if (Game.withdraw(50)) {
        Game.selectedTower.upgrade();
      }
    }
  }

  private releaseMonster(): void {
    if (this.currentLevel === null || !Game.monstersComing || Game.ticksNow - this.lastTimeMonsterCreated < this.monsterCreationInterval) {
      return;
    }
    if (this.currentMonsterIndex === this.currentLevel.monsterSequence.length) {
      this.currentMonsterIndex = 0;
    }
    const monsterCode = this.currentLevel.monsterSequence[this.currentMonsterIndex];
    Game.createMonster(monsterCode, this.currentLevel.points);
    this.currentMonsterIndex += 1;
    this.monstersFiredOnThisLevel += 1;
    this.lastTimeMonsterCreated = Game.ticksNow;
    this.monsterCreationInterval = Game.ticksPerSecond * Util.randomInRange(0.5, 1.5);
    if (this.monstersFiredOnThisLevel === this.currentLevel.monsterCount) {
      Game.monstersComing = false;
    }
  }

  private pauseButtonClick(): void {
    if (Game.isPlaying) {
      Game.pauseGame();
    } else {
      Game.resumeGame();
    }
  }

  private updatePauseButton(): void {
    const pause = this.buttons[this.buttons.length - 1];
    pause.label = Game.isPlaying ? "||" : "►";
  }

  private handleKey(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (key === " " || key === "spacebar") {
      this.pauseButtonClick();
      event.preventDefault();
    } else if (key === "1" || key === "g") {
      this.towerMode = TowerBuildingMode.GunTower;
      Game.selectedTower = null;
    } else if (key === "2" || key === "l") {
      this.towerMode = TowerBuildingMode.LaserTower;
      Game.selectedTower = null;
    } else if (key === "3" || key === "m") {
      this.towerMode = TowerBuildingMode.MissileTower;
      Game.selectedTower = null;
    } else if (key === "4" || key === "s") {
      this.towerMode = TowerBuildingMode.SlowingTower;
      Game.selectedTower = null;
    } else if (key === "u") {
      this.upgradeTower();
    } else if (key === "escape") {
      this.towerMode = TowerBuildingMode.None;
      Game.selectedTower = null;
    }
  }

  private getCanvasPoint(event: MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return new Point(
      (event.clientX - rect.left) * (this.canvas.width / rect.width),
      (event.clientY - rect.top) * (this.canvas.height / rect.height),
    );
  }

  private drawRootBackground(): void {
    const gradient = this.context.createLinearGradient(0, 450, 0, 520);
    gradient.addColorStop(0, "#000");
    gradient.addColorStop(0.7, "#2f4f4f");
    this.context.fillStyle = gradient;
    this.context.fillRect(0, 0, 700, 520);
  }

  private updateOpacityAnimations(): void {
    const stripStep = Game.currentFrameMultiplier / 9;
    this.towerTypesOpacity = this.moveToward(this.towerTypesOpacity, this.showTowerTypes ? 1 : 0, stripStep);
    this.towerActionsOpacity = this.moveToward(this.towerActionsOpacity, this.showTowerActions ? 1 : 0, stripStep);

    const rangeStep = Game.currentFrameMultiplier / 15;
    const rangeTarget = Game.selectedTower !== null ? 0.1 : 0;
    this.selectedRangeOpacity = this.moveToward(this.selectedRangeOpacity, rangeTarget, rangeStep);
    if (this.selectedRangeOpacity === 0 && Game.selectedTower === null) {
      this.selectedRangeTower = null;
    }
  }

  private moveToward(value: number, target: number, step: number): number {
    if (value < target) {
      return Math.min(target, value + step);
    }
    if (value > target) {
      return Math.max(target, value - step);
    }
    return value;
  }

  private drawPlayfield(): void {
    this.context.fillStyle = "#000";
    this.context.fillRect(0, 0, Game.canvasWidth, Game.canvasHeight);
  }

  private drawPath(): void {
    if (this.currentLevel === null) {
      return;
    }
    const points = this.currentLevel.points;
    this.context.save();
    this.context.strokeStyle = "#0c2c29";
    this.context.lineWidth = 18;
    this.context.lineJoin = "round";
    this.context.beginPath();
    this.context.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) {
      this.context.lineTo(point.x, point.y);
    }
    this.context.stroke();
    this.context.restore();
  }

  private drawFinalPoint(): void {
    if (this.currentLevel === null) {
      return;
    }
    const point = this.currentLevel.points[this.currentLevel.points.length - 1];
    this.context.save();
    this.context.fillStyle = "#0c2c29";
    this.context.beginPath();
    this.context.arc(point.x, point.y, 15, 0, Math.PI * 2);
    this.context.fill();
    this.context.fillStyle = "#fff";
    this.context.font = "14px Arial, sans-serif";
    this.context.textAlign = "center";
    this.context.textBaseline = "middle";
    this.context.fillText(String(Math.max(0, Game.monstersAllowedToEscape)), point.x, point.y);
    this.context.restore();
  }

  private drawFutureTowerIndicators(): void {
    if (this.currentLevel === null || this.towerMode === TowerBuildingMode.None || this.mouse.y > Game.canvasHeight || !this.validateTowerPosition(this.mouse)) {
      return;
    }
    const range = Util.getTowerRange(this.towerMode);
    this.context.save();
    this.context.globalAlpha = 0.3;
    this.context.strokeStyle = "#fff";
    this.context.lineWidth = 1;
    this.context.beginPath();
    this.context.moveTo(this.mouse.x, 0);
    this.context.lineTo(this.mouse.x, 1000);
    this.context.moveTo(0, this.mouse.y);
    this.context.lineTo(1000, this.mouse.y);
    this.context.stroke();
    this.context.globalAlpha = 0.4;
    this.context.strokeStyle = "#008000";
    this.context.beginPath();
    this.context.arc(this.mouse.x, this.mouse.y, range, 0, Math.PI * 2);
    this.context.stroke();
    this.context.globalAlpha = 0.5;
    this.context.fillStyle = "#000";
    this.context.strokeStyle = "#fff";
    this.context.beginPath();
    this.context.arc(this.mouse.x, this.mouse.y, Tower.towerRadius, 0, Math.PI * 2);
    this.context.fill();
    this.context.stroke();
    this.context.restore();
  }

  private drawSelectedTowerRangeIndicator(): void {
    const tower = this.selectedRangeTower;
    if (tower === null || this.selectedRangeOpacity <= 0) {
      return;
    }
    this.context.save();
    const gradient = this.context.createRadialGradient(tower.x, tower.y, 0, tower.x, tower.y, tower.range);
    gradient.addColorStop(0, `rgba(0,0,0,${this.selectedRangeOpacity})`);
    gradient.addColorStop(1, `rgba(128,128,128,${this.selectedRangeOpacity})`);
    this.context.fillStyle = gradient;
    this.context.strokeStyle = `rgba(0,128,0,${this.selectedRangeOpacity})`;
    this.context.lineWidth = 1.5;
    this.context.beginPath();
    this.context.arc(tower.x, tower.y, tower.range, 0, Math.PI * 2);
    this.context.fill();
    this.context.stroke();
    this.context.restore();
  }

  private drawTowerSelectionIndicator(): void {
    const tower = Game.selectedTower;
    if (tower === null) {
      return;
    }
    const circumference = 2 * Math.PI * 15;
    this.context.save();
    this.context.strokeStyle = "rgba(255,255,255,0.5)";
    this.context.setLineDash([3, 2]);
    this.context.lineDashOffset = -((performance.now() % 10000) / 10000) * circumference;
    this.context.lineWidth = 1.5;
    this.context.beginPath();
    this.context.arc(tower.x, tower.y, 15, 0, Math.PI * 2);
    this.context.stroke();
    this.context.restore();
  }

  private drawLevelName(): void {
    if (!this.levelNameVisible) {
      return;
    }
    const opacity = this.levelNameElapsed < 0.5 ? 1 : Math.max(0, 1 - ((this.levelNameElapsed - 0.5) / 1));
    const y = this.levelNameElapsed < 0.5 ? 164 : 164 - ((this.levelNameElapsed - 0.5) * 164);
    this.context.save();
    this.context.globalAlpha = opacity;
    this.context.fillStyle = "#00ff7f";
    this.context.font = "90px Arial, sans-serif";
    this.context.textAlign = "center";
    this.context.textBaseline = "top";
    this.context.shadowColor = "#00ff7f";
    this.context.shadowBlur = 6;
    this.context.fillText(this.levelNameText, 350, y);
    this.context.restore();
  }

  private drawBottomUi(): void {
    this.buttons.slice(0, 4).forEach((button) => {
      button.visible = this.towerTypesOpacity > 0;
      button.render(this.context, button.contains(this.mouse.x, this.mouse.y), this.pressedButton === button, this.towerTypesOpacity);
      if (button.visible) {
        this.drawTowerButtonIcon(button, this.towerTypesOpacity);
      }
    });
    this.buttons[4].visible = this.towerActionsOpacity > 0;
    this.buttons[5].visible = this.towerActionsOpacity > 0;
    this.buttons[5].enabled = Game.selectedTower !== null && Game.selectedTower.level !== Tower.maxLevel;
    this.buttons[4].render(this.context, this.buttons[4].contains(this.mouse.x, this.mouse.y), this.pressedButton === this.buttons[4], this.towerActionsOpacity);
    this.buttons[5].render(this.context, this.buttons[5].contains(this.mouse.x, this.mouse.y), this.pressedButton === this.buttons[5], this.towerActionsOpacity);
    this.buttons[6].visible = Game.isPlaying || this.currentLevel !== null;
    this.buttons[6].render(this.context, this.buttons[6].contains(this.mouse.x, this.mouse.y), this.pressedButton === this.buttons[6]);

    if (Game.isPlaying || this.currentLevel !== null) {
      this.context.save();
      this.context.fillStyle = "#ffff00";
      this.context.font = "25px Arial, sans-serif";
      this.context.textAlign = "right";
      this.context.textBaseline = "middle";
      this.context.fillText(`$${Math.round(Game.balance).toLocaleString()}`, 688, 493);
      this.context.restore();
    }
  }

  private findVisibleButton(pos: Point): CanvasButton | undefined {
    return this.buttons.find((candidate) => candidate.contains(pos.x, pos.y));
  }

  private drawTowerButtonIcon(button: CanvasButton, opacity = 1): void {
    const centerX = button.x + (button.width / 2);
    const centerY = button.y + (button.height / 2);
    this.context.save();
    this.context.globalAlpha = opacity;
    if (button.label === "Gun") {
      const angle = -0.8;
      const gunLength = 16;
      const gradient = this.context.createRadialGradient(centerX, centerY, 1, centerX, centerY, Tower.towerRadius);
      gradient.addColorStop(0, "#fff");
      gradient.addColorStop(1, "#000");
      this.context.fillStyle = gradient;
      this.context.strokeStyle = "#fff";
      this.context.lineWidth = 1.5;
      this.context.beginPath();
      this.context.arc(centerX, centerY, Tower.towerRadius, 0, Math.PI * 2);
      this.context.fill();
      this.context.stroke();
      this.context.lineWidth = 2;
      this.context.lineCap = "round";
      this.context.beginPath();
      this.context.moveTo(centerX, centerY);
      this.context.lineTo(centerX + (gunLength * Math.cos(angle)), centerY + (gunLength * Math.sin(angle)));
      this.context.stroke();
    } else if (button.label === "Laser") {
      this.context.fillStyle = "#000";
      this.context.beginPath();
      this.context.arc(centerX, centerY, 12.5, 0, Math.PI * 2);
      this.context.fill();
      this.context.translate(centerX, centerY);
      this.context.rotate(-0.35);
      this.context.fillStyle = "#00ffff";
      this.context.strokeStyle = "#fff";
      this.context.lineWidth = 1.5;
      this.context.beginPath();
      this.context.moveTo(-10, 5);
      this.context.lineTo(-2, 4);
      this.context.lineTo(10, 0);
      this.context.lineTo(-2, -4);
      this.context.lineTo(-10, -5);
      this.context.closePath();
      this.context.fill();
      this.context.stroke();
    } else if (button.label === "Missile") {
      this.context.translate(centerX, centerY);
      this.context.rotate(Math.PI / 4);
      const gradient = this.context.createRadialGradient(0, 0, 1, 0, 0, Tower.towerRadius);
      gradient.addColorStop(0, "#ffff00");
      gradient.addColorStop(1, "#000");
      this.context.fillStyle = gradient;
      this.context.strokeStyle = "#fff";
      this.context.lineWidth = 1.5;
      this.context.fillRect(-Tower.towerRadius, -Tower.towerRadius, Tower.towerRadius * 2, Tower.towerRadius * 2);
      this.context.strokeRect(-Tower.towerRadius, -Tower.towerRadius, Tower.towerRadius * 2, Tower.towerRadius * 2);
    } else {
      const pulse = (Math.sin(performance.now() / 500) + 1) / 2;
      const yellow = Math.round(255 * pulse);
      const gradient = this.context.createRadialGradient(centerX, centerY, 1, centerX, centerY, Tower.towerRadius);
      gradient.addColorStop(0, "#000");
      gradient.addColorStop(0.9, `rgb(${yellow},${yellow},0)`);
      this.context.fillStyle = gradient;
      this.context.strokeStyle = "#fff";
      this.context.lineWidth = 1.5;
      this.context.beginPath();
      this.context.arc(centerX, centerY, Tower.towerRadius, 0, Math.PI * 2);
      this.context.fill();
      this.context.stroke();
    }
    this.context.restore();
  }
}
