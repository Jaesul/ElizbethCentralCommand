import fs from "node:fs";
import path from "node:path";

function usage() {
  console.log(
    [
      "freeflow_calibrate.mjs - derive grams-per-click at ~0 bar from a ws_capture CSV",
      "",
      "Usage:",
      "  node freeflow_calibrate.mjs <capture.(csv|raw.log)> [--max-pressure 0.5] [--min-dclicks 10]",
      "                                 [--warmup-ms 1500] [--min-dt-ms 150] [--mad-k 4]",
      "",
      "Output:",
      "  Prints per-power summaries and an overall median g/click estimate.",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const args = {
    file: "",
    maxPressure: 0.5,
    minDClicks: 10,
    warmupMs: 1500,
    minDtMs: 150,
    madK: 4,
  };

  const pos = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--max-pressure" && next) {
      args.maxPressure = Number(next);
      i++;
    } else if (a === "--min-dclicks" && next) {
      args.minDClicks = Number(next);
      i++;
    } else if (a === "--warmup-ms" && next) {
      args.warmupMs = Number(next);
      i++;
    } else if (a === "--min-dt-ms" && next) {
      args.minDtMs = Number(next);
      i++;
    } else if (a === "--mad-k" && next) {
      args.madK = Number(next);
      i++;
    } else if (a === "--help" || a === "-h") {
      args.help = true;
    } else {
      pos.push(a);
    }
  }
  args.file = pos[0] ?? "";
  return args;
}

const args = parseArgs(process.argv);
if (args.help || !args.file) {
  usage();
  process.exit(args.help ? 0 : 1);
}

const inPath = args.file;
const text = fs.readFileSync(inPath, "utf8");
const linesRaw = text.split(/\r?\n/);
const lines = linesRaw.filter((l) => l.trim().length > 0);

if (lines.length < 2) {
  throw new Error("CSV has no data rows");
}

const CSV_NUMERIC_ROW_RE = /^\s*[-0-9.]+(\s*,\s*[-0-9.]+)+\s*$/;

function isCsvHeader(line) {
  const s = line.trim().replace(/^\uFEFF/, "");
  return s.startsWith("time_ms,") || s.startsWith("t_ms,");
}

function isCsvNumericRow(line) {
  return CSV_NUMERIC_ROW_RE.test(line.trim());
}

function inferHeaderFromRow(line) {
  const parts = line
    .trim()
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "");
  const n = parts.length;
  if (n === 4) return "time_ms,power_pct,weight_g,flow_gps";
  if (n === 5) return "time_ms,power_pct,weight_g,flow_gps,pressure_bar";
  if (n === 7) return "time_ms,power_pct,weight_g,flow_gps,pressure_bar,clicks_total,clicks_per_s";
  return null;
}

// Support both clean CSV and raw logs that contain mixed text lines + numeric CSV rows.
let header = "";
/** @type {string[]} */
let dataLines = [];
for (const ln of lines) {
  if (!header && isCsvHeader(ln)) {
    header = ln.trim().replace(/^\uFEFF/, "");
    continue;
  }
  if (isCsvNumericRow(ln)) {
    dataLines.push(ln.trim());
  }
}

if (!header && dataLines.length > 0) {
  const inferred = inferHeaderFromRow(dataLines[0]);
  if (!inferred) {
    throw new Error("Unable to infer header from first numeric row");
  }
  header = inferred;
}

if (!header) {
  throw new Error("No CSV header found and no numeric rows to infer from");
}

const cols = header.split(",").map((s) => s.trim());

function colIdx(name) {
  const i = cols.indexOf(name);
  if (i < 0) throw new Error(`Missing column '${name}' in header: ${header}`);
  return i;
}

const idxTime = colIdx("time_ms");
const idxPower = colIdx("power_pct");
const idxWeight = colIdx("weight_g");
const idxPressure = colIdx("pressure_bar");
const idxClicks = colIdx("clicks_total");

/** @type {Map<string, Array<{t:number, w:number, p:number, c:number}>>} */
const byPower = new Map();

for (const row of dataLines) {
  const parts = row.split(",").map((s) => s.trim());
  if (parts.length !== cols.length) continue;
  const t = Number(parts[idxTime]);
  const power = parts[idxPower];
  const w = Number(parts[idxWeight]);
  const p = Number(parts[idxPressure]);
  const c = Number(parts[idxClicks]);
  if (!Number.isFinite(t) || !Number.isFinite(w) || !Number.isFinite(p) || !Number.isFinite(c)) continue;

  if (!byPower.has(power)) byPower.set(power, []);
  byPower.get(power).push({ t, w, p, c });
}

function median(xs) {
  const a = xs.slice().sort((x, y) => x - y);
  const n = a.length;
  if (n === 0) return NaN;
  if (n % 2 === 1) return a[(n - 1) / 2];
  return (a[n / 2 - 1] + a[n / 2]) / 2;
}

function mad(xs, med) {
  const dev = xs.map((x) => Math.abs(x - med));
  return median(dev);
}

/** @type {Array<number>} */
const allEstimates = [];

console.log(`file: ${path.resolve(inPath)}`);
console.log(`filter: pressure_bar < ${args.maxPressure}`);
console.log(`warmup: ${args.warmupMs}ms, min_dt: ${args.minDtMs}ms, min_dclicks: ${args.minDClicks}, mad_k: ${args.madK}`);
console.log("");
console.log("power_pct,raw_segments,kept_segments,median_g_per_click,median_trimmed_g_per_click");

for (const [power, rows] of [...byPower.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
  // keep only low-pressure rows
  const r0 = rows.filter((x) => x.p < args.maxPressure);
  if (r0.length < 2) continue;

  // Warmup removal (skip first N ms from first seen timestamp for this power step)
  const t0 = r0[0].t;
  const r = r0.filter((x) => (x.t - t0) >= args.warmupMs);
  if (r.length < 2) continue;

  // compute windowed g/click deltas between successive rows
  /** @type {Array<number>} */
  const est = [];
  for (let i = 1; i < r.length; i++) {
    const dt = r[i].t - r[i - 1].t;
    const dw = r[i].w - r[i - 1].w;
    const dc = r[i].c - r[i - 1].c;
    if (dt >= args.minDtMs && dc >= args.minDClicks && dw > 0) {
      est.push(dw / dc);
    }
  }

  if (est.length === 0) continue;
  const m = median(est);
  const mdev = mad(est, m);

  // Robust trimming: keep within median ± madK * MAD. If MAD==0, keep all.
  const lo = mdev > 0 ? (m - args.madK * mdev) : -Infinity;
  const hi = mdev > 0 ? (m + args.madK * mdev) : Infinity;
  const kept = est.filter((x) => x >= lo && x <= hi);
  if (kept.length === 0) continue;

  const mKept = median(kept);
  allEstimates.push(mKept);
  console.log(`${power},${est.length},${kept.length},${m.toFixed(6)},${mKept.toFixed(6)}`);
}

console.log("");
if (allEstimates.length === 0) {
  console.log("No valid segments found. Try increasing capture length, increasing power, or loosening --max-pressure/--min-dclicks.");
  process.exit(2);
}

console.log(`overall_median_g_per_click=${median(allEstimates).toFixed(6)}`);


