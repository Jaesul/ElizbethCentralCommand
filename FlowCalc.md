# Flow Rate Calculation from Polled Weight (TypeScript Version)

This document shows how to correctly compute a smooth, accurate espresso
**flow rate** from polled weight readings using TypeScript.

Naive derivative (`w[i] - w[i-1]`) is *too noisy*.The correct approach uses:

1. Real timestamps
2. A windowed derivative (100–250ms)
3. Exponential Moving Average (EMA) smoothing

This produces a stable, realistic flow curve.

---

## 🧪 Recommended Settings

Assuming you're sampling weight at ~40–80 Hz:

| Purpose             | Value                |
| ------------------- | -------------------- |
| Derivative window   | **100 ms**     |
| EMA smoothing alpha | **0.15–0.25** |
| Negative clamp      | **Clamp to 0** |

Suggested defaults:

```ts
const WINDOW_MS = 100;
const ALPHA = 0.2;
```
