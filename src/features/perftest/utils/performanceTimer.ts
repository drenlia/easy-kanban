/**
 * Performance Timer Utility
 * Simple utility for measuring test execution time
 */

export class PerformanceTimer {
  private startTime: number = 0;
  private endTime: number = 0;
  private isRunning: boolean = false;

  start(): void {
    this.startTime = performance.now();
    this.isRunning = true;
  }

  stop(): number {
    if (!this.isRunning) {
      throw new Error('Timer was not started');
    }
    this.endTime = performance.now();
    this.isRunning = false;
    return this.getDuration();
  }

  getDuration(): number {
    if (this.isRunning) {
      return performance.now() - this.startTime;
    }
    return this.endTime - this.startTime;
  }

  getDurationFormatted(): string {
    const duration = this.getDuration();
    if (duration < 1000) {
      return `${Math.round(duration)}ms`;
    }
    return `${(duration / 1000).toFixed(2)}s`;
  }

  reset(): void {
    this.startTime = 0;
    this.endTime = 0;
    this.isRunning = false;
  }
}

