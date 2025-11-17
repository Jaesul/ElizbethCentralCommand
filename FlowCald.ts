// flowRateCalculator.ts

type FlowRateOptions = {
    // Time window over which to compute the derivative (ms).
    // Set this larger than the typical drip interval, e.g. 400–600ms.
    windowMs?: number;
  
    // EMA smoothing factor (0–1). Higher = more responsive, lower = smoother.
    alpha?: number;
  
    // Ignore tiny weight changes below this threshold (grams).
    deadbandGrams?: number;
  
    // How long to keep history around (ms). 2–3s is plenty.
    historyMs?: number;
  };
  
  export class FlowRateCalculator {
    private weights: number[] = [];
    private times: number[] = [];
  
    private flowEMA = 0;
  
    private windowMs: number;
    private alpha: number;
    private deadbandGrams: number;
    private historyMs: number;
  
    constructor(options: FlowRateOptions = {}) {
      this.windowMs = options.windowMs ?? 800;        // 0.5s window
      this.alpha = options.alpha ?? 0.2;              // decent responsiveness
      this.deadbandGrams = options.deadbandGrams ?? 0.03; // ignore <0.03g
      this.historyMs = options.historyMs ?? 2500;     // keep ~2.5s of samples
    }
  
    /**
     * Call this every time a new weight sample arrives.
     * @param weight  Weight in grams
     * @param tsMs    Timestamp in ms (performance.now() or Date.now())
     * @returns       Smoothed flow in g/s
     */
    addSample(weight: number, tsMs: number): number {
      this.weights.push(weight);
      this.times.push(tsMs);
  
      // Drop old samples outside history window
      const cutoff = tsMs - this.historyMs;
      while (this.times.length > 0 && this.times[0] < cutoff) {
        this.times.shift();
        this.weights.shift();
      }
  
      if (this.times.length < 2) {
        return this.flowEMA;
      }
  
      // Find the sample at least windowMs ago
      const targetTime = tsMs - this.windowMs;
      let j = this.times.length - 1;
  
      // walk backward until we find a point older than our target window
      while (j > 0 && this.times[j] > targetTime) {
        j--;
      }
  
      const i = this.times.length - 1;
  
      const dt = (this.times[i] - this.times[j]) / 1000; // seconds
      const dw = this.weights[i] - this.weights[j];
  
      let flowRaw = 0;
  
      if (dt > 0) {
        // deadband: treat tiny deltas as noise
        if (Math.abs(dw) >= this.deadbandGrams) {
          flowRaw = dw / dt; // g/s over the window
        }
      }
  
      // EMA smoothing on top of windowed derivative
      this.flowEMA = this.alpha * flowRaw + (1 - this.alpha) * this.flowEMA;
  
      if (this.flowEMA < 0) this.flowEMA = 0;
  
      return this.flowEMA;
    }
  }
  