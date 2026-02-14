export type TimerCallback = (remaining: number, elapsed: number) => void;
export type TimerCompleteCallback = () => void;

export class TimerWorkerManager {
  private worker: Worker | null = null;
  private onTick: TimerCallback | null = null;
  private onComplete: TimerCompleteCallback | null = null;
  private fallbackId: ReturnType<typeof setInterval> | null = null;

  start(
    duration: number,
    onTick: TimerCallback,
    onComplete: TimerCompleteCallback
  ) {
    this.stop(); // clean up any existing worker or fallback
    this.onTick = onTick;
    this.onComplete = onComplete;

    try {
      this.worker = new Worker("/workers/timer.js");
      this.worker.onmessage = (e: MessageEvent) => {
        if (e.data.type === "tick") {
          this.onTick?.(e.data.remaining, e.data.elapsed);
        }
        if (e.data.type === "complete") {
          this.onComplete?.();
        }
      };
      this.worker.onerror = () => {
        // If the worker fails to load, fall back to setInterval
        this.worker?.terminate();
        this.worker = null;
        this.fallbackStart(duration);
      };
      this.worker.postMessage({ type: "start", duration });
    } catch {
      // Fallback to setInterval if Workers unavailable
      this.fallbackStart(duration);
    }
  }

  addTime(seconds: number) {
    if (this.worker) {
      this.worker.postMessage({ type: "add", seconds });
    }
    // For fallback mode, the store handles duration/remaining updates directly,
    // so no extra work needed here.
  }

  stop() {
    if (this.worker) {
      this.worker.postMessage({ type: "stop" });
      this.worker.terminate();
      this.worker = null;
    }
    if (this.fallbackId !== null) {
      clearInterval(this.fallbackId);
      this.fallbackId = null;
    }
  }

  private fallbackStart(duration: number) {
    // setInterval fallback for environments without Worker support
    let remaining = duration;
    const startTime = Date.now();

    this.fallbackId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      remaining = duration - elapsed;
      this.onTick?.(remaining, elapsed);

      if (remaining <= 0 && remaining > -1) {
        this.onComplete?.();
        // Don't clear — let it keep counting for overtime display
      }
    }, 1000);
  }
}
