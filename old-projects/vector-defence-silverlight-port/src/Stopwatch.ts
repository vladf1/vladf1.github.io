export class Stopwatch {
  private startedAt = performance.now();
  private storedElapsed = 0;
  private running = true;

  static startNew(): Stopwatch {
    return new Stopwatch();
  }

  get elapsedMilliseconds(): number {
    if (!this.running) {
      return this.storedElapsed;
    }
    return this.storedElapsed + performance.now() - this.startedAt;
  }

  stop(): void {
    if (!this.running) {
      return;
    }
    this.storedElapsed = this.elapsedMilliseconds;
    this.running = false;
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.startedAt = performance.now();
    this.running = true;
  }
}
