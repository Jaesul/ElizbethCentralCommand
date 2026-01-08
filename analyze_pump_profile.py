#!/usr/bin/env python3
"""
Pump Profile Analyzer

Analyzes CSV data from AutoPumpProfiler and calculates average flow rate
at each power level. Supports multiple CSV files and outlier removal.

Usage:
    python analyze_pump_profile.py <input1.csv> [input2.csv ...] [--output <output.csv>] [--remove-outliers]

Input CSV format:
    time_ms,power_pct,weight_g,flow_gps

Output:
    Prints summary statistics and optionally saves results to CSV.
"""

import sys
import csv
import argparse
from collections import defaultdict
from statistics import mean, stdev, median
from typing import Dict, List, Tuple

def _percentile(sorted_vals: List[float], p: float) -> float:
    """
    Percentile with linear interpolation (p in [0,100]).
    No numpy dependency.
    """
    if not sorted_vals:
        raise ValueError("empty data")
    if p <= 0:
        return sorted_vals[0]
    if p >= 100:
        return sorted_vals[-1]
    n = len(sorted_vals)
    # position in [0, n-1]
    pos = (p / 100.0) * (n - 1)
    lo = int(pos)
    hi = min(lo + 1, n - 1)
    frac = pos - lo
    return sorted_vals[lo] * (1.0 - frac) + sorted_vals[hi] * frac


def remove_outliers_iqr(data: List[float]) -> List[float]:
    """
    Remove outliers using Interquartile Range (IQR) method.
    Returns data with outliers removed.
    """
    if len(data) < 4:
        return data  # Need at least 4 points for IQR

    s = sorted(data)
    q1 = _percentile(s, 25)
    q3 = _percentile(s, 75)
    iqr = q3 - q1
    
    lower_bound = q1 - 1.5 * iqr
    upper_bound = q3 + 1.5 * iqr
    
    return [x for x in data if lower_bound <= x <= upper_bound]


def remove_outliers_zscore(data: List[float], threshold: float = 2.5) -> List[float]:
    """
    Remove outliers using Z-score method.
    Returns data with outliers removed.
    """
    if len(data) < 3:
        return data
    
    mean_val = mean(data)
    std_val = stdev(data) if len(data) > 1 else 0.0
    
    if std_val == 0:
        return data
    
    return [x for x in data if abs((x - mean_val) / std_val) <= threshold]


def parse_csv(filename: str) -> List[Tuple[int, int, float, float]]:
    """
    Parse the CSV file and return list of (time_ms, power_pct, weight_g, flow_gps).
    Skips header row and invalid lines.
    """
    data = []
    with open(filename, 'r') as f:
        reader = csv.reader(f)
        # Skip header
        try:
            header = next(reader)
            if header[0].strip() != 'time_ms':
                print(f"Warning: Expected header 'time_ms,...' but got '{','.join(header)}'")
        except StopIteration:
            print("Error: Empty file")
            return []
        
        for row_num, row in enumerate(reader, start=2):
            if not row or len(row) < 4:
                continue  # Skip empty or incomplete rows
            
            try:
                time_ms = int(row[0].strip())
                power_pct = int(row[1].strip())
                weight_g = float(row[2].strip())
                flow_gps = float(row[3].strip())
                data.append((time_ms, power_pct, weight_g, flow_gps))
            except (ValueError, IndexError) as e:
                print(f"Warning: Skipping invalid row {row_num}: {','.join(row)}")
                continue
    
    return data


def analyze_by_power_level(data: List[Tuple[int, int, float, float]], 
                           remove_outliers: bool = False) -> Dict[int, Dict]:
    """
    Group data by power level and calculate statistics.
    
    Args:
        data: List of (time_ms, power_pct, weight_g, flow_gps) tuples
        remove_outliers: If True, remove outliers using IQR method
    
    Returns:
        Dictionary mapping power_pct -> {
            'count': number of samples,
            'avg_flow': average flow rate (g/s),
            'std_flow': standard deviation of flow rate,
            'min_flow': minimum flow rate,
            'max_flow': maximum flow rate,
            'median_flow': median flow rate,
            'avg_weight': average weight (g),
            'duration_ms': total duration in milliseconds,
            'outliers_removed': number of outliers removed (if remove_outliers=True)
        }
    """
    by_power = defaultdict(lambda: {
        'flows': [],
        'weights': [],
        'times': []
    })
    
    for time_ms, power_pct, weight_g, flow_gps in data:
        by_power[power_pct]['flows'].append(flow_gps)
        by_power[power_pct]['weights'].append(weight_g)
        by_power[power_pct]['times'].append(time_ms)
    
    results = {}
    for power_pct, values in sorted(by_power.items()):
        flows = values['flows']
        weights = values['weights']
        times = values['times']
        
        if len(flows) == 0:
            continue
        
        # Remove outliers if requested
        outliers_removed = 0
        if remove_outliers and len(flows) >= 4:
            original_count = len(flows)
            flows = remove_outliers_iqr(flows)
            outliers_removed = original_count - len(flows)
        
        if len(flows) == 0:
            continue
        
        duration_ms = max(times) - min(times) if len(times) > 1 else 0
        
        results[power_pct] = {
            'count': len(flows),
            'avg_flow': mean(flows),
            'std_flow': stdev(flows) if len(flows) > 1 else 0.0,
            'min_flow': min(flows),
            'max_flow': max(flows),
            'median_flow': median(flows),
            'avg_weight': mean(weights),
            'duration_ms': duration_ms,
            'outliers_removed': outliers_removed
        }
    
    return results


def merge_results(all_results: List[Dict[int, Dict]]) -> Dict[int, Dict]:
    """
    Merge results from multiple datasets, calculating average across all datasets.
    
    Args:
        all_results: List of result dictionaries from analyze_by_power_level()
    
    Returns:
        Merged dictionary with averaged statistics
    """
    # Collect all power levels
    all_power_levels = set()
    for results in all_results:
        all_power_levels.update(results.keys())
    
    merged = {}
    for power_pct in sorted(all_power_levels):
        # Collect stats for this power level from all datasets
        avg_flows = []
        std_flows = []
        counts = []
        min_flows = []
        max_flows = []
        median_flows = []
        outliers_removed = []
        
        for results in all_results:
            if power_pct in results:
                r = results[power_pct]
                avg_flows.append(r['avg_flow'])
                std_flows.append(r['std_flow'])
                counts.append(r['count'])
                min_flows.append(r['min_flow'])
                max_flows.append(r['max_flow'])
                median_flows.append(r['median_flow'])
                outliers_removed.append(r.get('outliers_removed', 0))
        
        if len(avg_flows) == 0:
            continue
        
        merged[power_pct] = {
            'count': sum(counts),
            'avg_flow': mean(avg_flows),
            'std_flow': mean(std_flows),  # Average of std devs
            'min_flow': min(min_flows),
            'max_flow': max(max_flows),
            'median_flow': mean(median_flows),
            'datasets': len(avg_flows),
            'outliers_removed': sum(outliers_removed)
        }
    
    return merged


def print_summary(results: Dict[int, Dict], title: str = "PUMP PROFILE ANALYSIS SUMMARY"):
    """Print formatted summary statistics."""
    print("\n" + "="*80)
    print(title)
    print("="*80)
    
    if any('datasets' in r for r in results.values()):
        # Merged results
        print(f"{'Power':<8} {'Avg Flow':<12} {'Std Dev':<12} {'Min':<10} {'Max':<10} {'Datasets':<10} {'Samples':<10}")
        print("-"*80)
        
        for power_pct in sorted(results.keys()):
            r = results[power_pct]
            print(f"{power_pct:>3}%    "
                  f"{r['avg_flow']:>8.3f} g/s  "
                  f"{r['std_flow']:>8.3f}      "
                  f"{r['min_flow']:>8.3f}    "
                  f"{r['max_flow']:>8.3f}    "
                  f"{r['datasets']:>6}      "
                  f"{r['count']:>6}")
    else:
        # Single dataset results
        print(f"{'Power':<8} {'Avg Flow':<12} {'Std Dev':<12} {'Min':<10} {'Max':<10} {'Samples':<10}")
        print("-"*80)
        
        for power_pct in sorted(results.keys()):
            r = results[power_pct]
            print(f"{power_pct:>3}%    "
                  f"{r['avg_flow']:>8.3f} g/s  "
                  f"{r['std_flow']:>8.3f}      "
                  f"{r['min_flow']:>8.3f}    "
                  f"{r['max_flow']:>8.3f}    "
                  f"{r['count']:>6}")
    
    print("="*80)
    print()


def save_results_csv(results: Dict[int, Dict], filename: str):
    """Save analysis results to CSV file."""
    with open(filename, 'w', newline='') as f:
        writer = csv.writer(f)
        
        if any('datasets' in r for r in results.values()):
            # Merged results
            writer.writerow(['power_pct', 'avg_flow_gps', 'std_flow_gps', 'min_flow_gps', 
                            'max_flow_gps', 'median_flow_gps', 'datasets', 'total_samples'])
            
            for power_pct in sorted(results.keys()):
                r = results[power_pct]
                writer.writerow([
                    power_pct,
                    f"{r['avg_flow']:.3f}",
                    f"{r['std_flow']:.3f}",
                    f"{r['min_flow']:.3f}",
                    f"{r['max_flow']:.3f}",
                    f"{r['median_flow']:.3f}",
                    r['datasets'],
                    r['count']
                ])
        else:
            # Single dataset results
            writer.writerow(['power_pct', 'avg_flow_gps', 'std_flow_gps', 'min_flow_gps', 
                            'max_flow_gps', 'median_flow_gps', 'sample_count', 'duration_ms'])
            
            for power_pct in sorted(results.keys()):
                r = results[power_pct]
                writer.writerow([
                    power_pct,
                    f"{r['avg_flow']:.3f}",
                    f"{r['std_flow']:.3f}",
                    f"{r['min_flow']:.3f}",
                    f"{r['max_flow']:.3f}",
                    f"{r['median_flow']:.3f}",
                    r['count'],
                    r['duration_ms']
                ])
    
    print(f"Results saved to: {filename}")


def main():
    parser = argparse.ArgumentParser(
        description='Analyze pump profile CSV data and calculate flow rates by power level'
    )
    parser.add_argument('input', nargs='+', help='Input CSV file(s) from AutoPumpProfiler')
    parser.add_argument('-o', '--output', help='Output CSV file for results (optional)')
    parser.add_argument('--remove-outliers', action='store_true',
                       help='Remove outliers using IQR method before analysis')
    parser.add_argument('--merge', action='store_true',
                       help='Merge multiple input files and calculate average across datasets')
    
    args = parser.parse_args()
    
    all_results = []
    
    # Parse all input CSVs
    for input_file in args.input:
        print(f"Reading data from: {input_file}")
        data = parse_csv(input_file)
        
        if not data:
            print(f"Warning: No valid data found in {input_file}")
            continue
        
        print(f"Loaded {len(data)} data points from {input_file}")
        
        # Analyze by power level
        results = analyze_by_power_level(data, remove_outliers=args.remove_outliers)
        
        if not results:
            print(f"Warning: No data grouped by power level in {input_file}")
            continue
        
        all_results.append(results)
        
        # Print individual summary if not merging
        if not args.merge and len(args.input) > 1:
            print_summary(results, f"ANALYSIS: {input_file}")
    
    if not all_results:
        print("Error: No valid results from any input file")
        sys.exit(1)
    
    # Merge results if requested or if multiple files
    if args.merge or len(all_results) > 1:
        merged_results = merge_results(all_results)
        print_summary(merged_results, "MERGED PUMP PROFILE ANALYSIS (AVERAGE ACROSS DATASETS)")
        
        if args.output:
            save_results_csv(merged_results, args.output)
    else:
        # Single file analysis
        results = all_results[0]
        print_summary(results)
        
        if args.output:
            save_results_csv(results, args.output)


if __name__ == '__main__':
    main()
