#!/usr/bin/env python3
"""
Pressure Profile Analyzer

Input CSV format from `Arduino/TriacTests/PressureProfileController/PressureProfileController.ino`:
  t_ms,stage_idx,power_pct,pressure_bar,target_pressure_bar,weight_g,flow_gps,resistance_bar_per_gps

This script:
- groups by stage_idx
- computes summary stats (avg/median/std/min/max) for pressure, flow, power, and resistance proxy
- supports multiple input files, optional outlier removal (IQR)

Usage:
  python analyze_pressure_profile.py run1.csv [run2.csv ...] --merge --remove-outliers -o results.csv
"""

import sys
import csv
import argparse
from collections import defaultdict
from statistics import mean, median, stdev
from typing import Dict, List, Tuple


def _percentile(sorted_vals: List[float], p: float) -> float:
    if not sorted_vals:
        raise ValueError("empty data")
    if p <= 0:
        return sorted_vals[0]
    if p >= 100:
        return sorted_vals[-1]
    n = len(sorted_vals)
    pos = (p / 100.0) * (n - 1)
    lo = int(pos)
    hi = min(lo + 1, n - 1)
    frac = pos - lo
    return sorted_vals[lo] * (1.0 - frac) + sorted_vals[hi] * frac


def remove_outliers_iqr(data: List[float]) -> List[float]:
    if len(data) < 4:
        return data
    s = sorted(data)
    q1 = _percentile(s, 25)
    q3 = _percentile(s, 75)
    iqr = q3 - q1
    lo = q1 - 1.5 * iqr
    hi = q3 + 1.5 * iqr
    return [x for x in data if lo <= x <= hi]


Row = Tuple[int, int, int, float, float, float, float, float]


def parse_csv(path: str) -> List[Row]:
    rows: List[Row] = []
    with open(path, "r", newline="") as f:
        reader = csv.reader(f)
        try:
            header = next(reader)
        except StopIteration:
            return rows

        # Accept either exact header or any header starting with t_ms
        if not header or header[0].strip() not in ("t_ms", "time_ms"):
            # Some logs may have extra lines; keep scanning until we find header
            for header in reader:
                if header and header[0].strip() in ("t_ms", "time_ms"):
                    break
            else:
                return rows

        for row in reader:
            if not row or len(row) < 8:
                continue
            try:
                t_ms = int(row[0].strip())
                stage_idx = int(row[1].strip())
                power_pct = int(row[2].strip())
                pressure_bar = float(row[3].strip())
                target_pressure_bar = float(row[4].strip())
                weight_g = float(row[5].strip())
                flow_gps = float(row[6].strip())
                resistance = float(row[7].strip())
                rows.append(
                    (t_ms, stage_idx, power_pct, pressure_bar, target_pressure_bar, weight_g, flow_gps, resistance)
                )
            except ValueError:
                continue
    return rows


def summarize_stage(rows: List[Row], remove_outliers: bool) -> Dict:
    if not rows:
        return {}

    pressures = [r[3] for r in rows]
    targets = [r[4] for r in rows]
    flows = [r[6] for r in rows]
    powers = [r[2] for r in rows]
    resistances = [r[7] for r in rows]

    out_removed = 0
    if remove_outliers:
        before = len(resistances)
        keep_mask = set(remove_outliers_iqr(resistances))
        # If values repeat, using set can drop too much; fallback to flow outlier removal only.
        # Keep it simple: outlier removal on FLOW instead (more stable distribution).
        flows2 = remove_outliers_iqr(flows)
        out_removed = before - len(flows2)
        # Filter all series by indices of kept flows2 values (approx, by value match)
        # If this is too lossy, disable outliers for that run.
        if len(flows2) >= 4:
            allowed = set(flows2)
            idxs = [i for i, v in enumerate(flows) if v in allowed]
            pressures = [pressures[i] for i in idxs]
            targets = [targets[i] for i in idxs]
            flows = [flows[i] for i in idxs]
            powers = [powers[i] for i in idxs]
            resistances = [resistances[i] for i in idxs]

    t0 = rows[0][0]
    t1 = rows[-1][0]

    def _std(xs: List[float]) -> float:
        return stdev(xs) if len(xs) > 1 else 0.0

    return {
        "count": len(rows),
        "duration_ms": max(t0, t1) - min(t0, t1),
        "avg_pressure": mean(pressures),
        "std_pressure": _std(pressures),
        "avg_target_pressure": mean(targets),
        "avg_flow": mean(flows),
        "std_flow": _std(flows),
        "avg_power": mean(powers),
        "median_flow": median(flows),
        "avg_resistance": mean(resistances),
        "std_resistance": _std(resistances),
        "outliers_removed": out_removed,
    }

def filter_rows_min_flow(rows: List[Row], min_flow_gps: float) -> List[Row]:
    if min_flow_gps <= 0:
        return rows
    return [r for r in rows if r[6] >= min_flow_gps]

def analyze(rows: List[Row], remove_outliers: bool, min_flow_gps: float) -> Dict[int, Dict]:
    rows = filter_rows_min_flow(rows, min_flow_gps)
    by_stage: Dict[int, List[Row]] = defaultdict(list)
    for r in rows:
        by_stage[r[1]].append(r)

    results: Dict[int, Dict] = {}
    for stage_idx in sorted(by_stage.keys()):
        results[stage_idx] = summarize_stage(by_stage[stage_idx], remove_outliers)
    return results


def merge(all_results: List[Dict[int, Dict]]) -> Dict[int, Dict]:
    stages = set()
    for r in all_results:
        stages.update(r.keys())

    merged: Dict[int, Dict] = {}
    for stage in sorted(stages):
        vals = [r[stage] for r in all_results if stage in r and r[stage]]
        if not vals:
            continue
        merged[stage] = {
            "datasets": len(vals),
            "count": sum(v["count"] for v in vals),
            "avg_pressure": mean(v["avg_pressure"] for v in vals),
            "avg_target_pressure": mean(v["avg_target_pressure"] for v in vals),
            "avg_flow": mean(v["avg_flow"] for v in vals),
            "avg_power": mean(v["avg_power"] for v in vals),
            "avg_resistance": mean(v["avg_resistance"] for v in vals),
        }
    return merged


def print_summary(results: Dict[int, Dict], merged: bool):
    if merged:
        print("\n" + "=" * 90)
        print("MERGED PRESSURE PROFILE SUMMARY (per stage)")
        print("=" * 90)
        print(f"{'Stage':<8} {'AvgP':<10} {'TargetP':<10} {'AvgQ':<10} {'AvgPower':<10} {'AvgR(P/Q)':<12} {'Datasets':<10}")
        print("-" * 90)
        for stage, r in results.items():
            print(f"{stage:<8} {r['avg_pressure']:<10.2f} {r['avg_target_pressure']:<10.2f} {r['avg_flow']:<10.3f} "
                  f"{r['avg_power']:<10.1f} {r['avg_resistance']:<12.3f} {r['datasets']:<10}")
        print("=" * 90)
        return

    print("\n" + "=" * 110)
    print("PRESSURE PROFILE SUMMARY (per stage)")
    print("=" * 110)
    print(f"{'Stage':<8} {'AvgP':<8} {'StdP':<8} {'TargetP':<8} {'AvgQ':<8} {'StdQ':<8} {'AvgPower':<10} {'AvgR':<10} {'N':<6}")
    print("-" * 110)
    for stage, r in results.items():
        print(f"{stage:<8} {r['avg_pressure']:<8.2f} {r['std_pressure']:<8.2f} {r['avg_target_pressure']:<8.2f} "
              f"{r['avg_flow']:<8.3f} {r['std_flow']:<8.3f} {r['avg_power']:<10.1f} {r['avg_resistance']:<10.3f} {r['count']:<6}")
    print("=" * 110)


def save_csv(results: Dict[int, Dict], path: str, merged: bool):
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        if merged:
            w.writerow(["stage_idx", "avg_pressure_bar", "avg_target_pressure_bar", "avg_flow_gps", "avg_power_pct", "avg_resistance_bar_per_gps", "datasets", "total_samples"])
            for stage, r in results.items():
                w.writerow([stage, f"{r['avg_pressure']:.3f}", f"{r['avg_target_pressure']:.3f}", f"{r['avg_flow']:.4f}", f"{r['avg_power']:.2f}", f"{r['avg_resistance']:.4f}", r["datasets"], r["count"]])
        else:
            w.writerow(["stage_idx", "avg_pressure_bar", "std_pressure_bar", "avg_target_pressure_bar", "avg_flow_gps", "std_flow_gps", "avg_power_pct", "avg_resistance_bar_per_gps", "sample_count"])
            for stage, r in results.items():
                w.writerow([stage, f"{r['avg_pressure']:.3f}", f"{r['std_pressure']:.3f}", f"{r['avg_target_pressure']:.3f}", f"{r['avg_flow']:.4f}", f"{r['std_flow']:.4f}", f"{r['avg_power']:.2f}", f"{r['avg_resistance']:.4f}", r["count"]])


def main():
    ap = argparse.ArgumentParser(description="Analyze pressure profile CSV logs and summarize per stage.")
    ap.add_argument("inputs", nargs="+", help="Input CSV files")
    ap.add_argument("--remove-outliers", action="store_true", help="Remove outliers (IQR) before computing stats")
    ap.add_argument("--min-flow-gps", type=float, default=0.2, help="Ignore samples below this flow (headspace fill). Default: 0.2")
    ap.add_argument("--merge", action="store_true", help="Merge multiple files by averaging per-stage summaries")
    ap.add_argument("-o", "--output", help="Write summary CSV to file")
    args = ap.parse_args()

    all_stage_results: List[Dict[int, Dict]] = []
    for p in args.inputs:
        rows = parse_csv(p)
        if not rows:
            print(f"Warning: no usable rows in {p}")
            continue
        res = analyze(rows, remove_outliers=args.remove_outliers, min_flow_gps=args.min_flow_gps)
        all_stage_results.append(res)
        if len(args.inputs) > 1 and not args.merge:
            print_summary(res, merged=False)

    if not all_stage_results:
        print("Error: no valid inputs.")
        sys.exit(1)

    if args.merge or len(all_stage_results) > 1:
        merged = merge(all_stage_results)
        print_summary(merged, merged=True)
        if args.output:
            save_csv(merged, args.output, merged=True)
    else:
        res = all_stage_results[0]
        print_summary(res, merged=False)
        if args.output:
            save_csv(res, args.output, merged=False)


if __name__ == "__main__":
    main()


