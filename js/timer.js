export class CountdownTimer {
  constructor(totalSeconds, onTick, onFinish) {
    this.totalSeconds = totalSeconds;
    this.remaining = totalSeconds;
    this.onTick = onTick;
    this.onFinish = onFinish;
    this._t = null;
  }

  start() {
    if (this._t) return;
    const startAt = Date.now();
    let lastWhole = this.remaining;

    this._t = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startAt) / 1000);
      const newRemaining = Math.max(0, this.totalSeconds - elapsed);
      if (newRemaining !== lastWhole) {
        this.remaining = newRemaining;
        lastWhole = newRemaining;
        this.onTick?.(this.remaining);
        if (this.remaining <= 0) {
          this.stop();
          this.onFinish?.();
        }
      }
    }, 200);
  }

  stop() {
    if (this._t) clearInterval(this._t);
    this._t = null;
  }

  format() {
    const m = Math.floor(this.remaining / 60);
    const s = this.remaining % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
}
