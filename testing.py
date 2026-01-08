import argparse
import datetime as dt
import os
import re
import sys
import threading

import serial


CSV_HEADER_PREFIXES = ("time_ms,", "t_ms,")

# Accept numeric CSV rows with commas (e.g. 8 columns for pressure profiler, 4 for pump profiler)
CSV_NUMERIC_ROW_RE = re.compile(r"^\s*[-0-9.]+(\s*,\s*[-0-9.]+)+\s*$")


def is_csv_header(line: str) -> bool:
    s = line.strip().lstrip("\ufeff")  # tolerate BOM
    return any(s.startswith(p) for p in CSV_HEADER_PREFIXES)


def is_csv_numeric_row(line: str) -> bool:
    return bool(CSV_NUMERIC_ROW_RE.match(line.strip()))

def infer_header_from_row(line: str) -> str | None:
    """
    If we missed the header (common if the board booted before we started capture),
    infer the correct header from the number of comma-separated columns.
    """
    parts = [p.strip() for p in line.strip().split(",") if p.strip() != ""]
    n = len(parts)
    if n == 4:
        return "time_ms,power_pct,weight_g,flow_gps"
    if n == 5:
        return "time_ms,power_pct,weight_g,flow_gps,pressure_bar"
    if n == 8:
        return "t_ms,stage_idx,power_pct,pressure_bar,target_pressure_bar,weight_g,flow_gps,resistance_bar_per_gps"
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description="Serial capture + command sender for pump/pressure profilers")
    ap.add_argument("--port", default="COM18", help="Serial port (e.g. COM18)")
    ap.add_argument("--baud", type=int, default=115200, help="Baud rate")
    ap.add_argument("--out", default="", help="Output CSV path (default: auto timestamped)")
    ap.add_argument("--raw", default="", help="Optional raw log file path (captures ALL lines)")
    ap.add_argument("--auto-go", action="store_true", help="Send GO on connect")
    ap.add_argument(
        "--eol",
        default="lf",
        choices=("lf", "crlf"),
        help="Line ending for commands sent to device (lf=\\n, crlf=\\r\\n). Default: lf",
    )
    args = ap.parse_args()

    ts = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    out_csv = args.out or f"capture_{ts}.csv"
    out_raw = args.raw

    # Ensure output dirs exist
    os.makedirs(os.path.dirname(out_csv) or ".", exist_ok=True)
    if out_raw:
        os.makedirs(os.path.dirname(out_raw) or ".", exist_ok=True)

    ser = serial.Serial(args.port, args.baud, timeout=0.1, write_timeout=1)
    csv_f = open(out_csv, "w", newline="")
    raw_f = open(out_raw, "w", newline="") if out_raw else None

    stop_event = threading.Event()
    header_seen = False

    def reader():
        nonlocal header_seen
        while not stop_event.is_set():
            try:
                line = ser.readline().decode(errors="ignore")
            except Exception:
                continue

            if not line:
                continue

            # Echo everything to terminal
            sys.stdout.write(line)
            sys.stdout.flush()

            # Optional raw capture
            if raw_f:
                raw_f.write(line)
                raw_f.flush()

            # Clean CSV capture: only header + numeric rows
            if is_csv_header(line):
                csv_f.write(line.strip() + "\n")
                csv_f.flush()
                header_seen = True
                continue

            if is_csv_numeric_row(line):
                if not header_seen:
                    inferred = infer_header_from_row(line)
                    if inferred:
                        csv_f.write(inferred + "\n")
                        csv_f.flush()
                        header_seen = True
                        print(f"\n[csv] Missed device header; inferred and wrote: {inferred}\n")
                if header_seen:
                    csv_f.write(line.strip() + "\n")
                    csv_f.flush()

    t = threading.Thread(target=reader, daemon=True)
    t.start()

    print(f"\n[serial] Connected to {args.port} @ {args.baud}")
    print(f"[csv] Writing cleaned CSV to: {out_csv}")
    if out_raw:
        print(f"[raw] Writing raw log to: {out_raw}")
    print(f"[tx] EOL mode: {args.eol}")
    print("Type commands (GO/STOP/STATUS), Ctrl+C to exit\n")

    if args.auto_go:
        eol = b"\r\n" if args.eol == "crlf" else b"\n"
        ser.write(b"GO" + eol)
        ser.flush()
        print("[tx] GO (auto)")

    try:
        while True:
            cmd = input()
            s = cmd.strip()
            if not s:
                continue
            eol = "\r\n" if args.eol == "crlf" else "\n"
            payload = (s + eol).encode()
            ser.write(payload)
            ser.flush()
            print(f"[tx] {s}")
    except KeyboardInterrupt:
        pass
    finally:
        stop_event.set()
        try:
            ser.close()
        except Exception:
            pass
        csv_f.close()
        if raw_f:
            raw_f.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
