import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const args = {
    csv: "",
    segments: "",
    out: "",
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--csv" && next) {
      args.csv = next;
      i++;
    } else if (a === "--segments" && next) {
      args.segments = next;
      i++;
    } else if (a === "--out" && next) {
      args.out = next;
      i++;
    } else if (a === "--help" || a === "-h") {
      args.help = true;
    }
  }
  return args;
}

function usage() {
  console.log(
    [
      "opv_analyze.mjs - compute P_peak / P_hold / deltaP per step segment",
      "",
      "Usage:",
      "  node opv_analyze.mjs --csv captures/run1.csv --segments captures/run1.segments.json",
      "",
      "Outputs:",
      "  results/<run>_summary.csv (unless --out is provided)",
    ].join("\n"),
  );
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function median(values) {
  if (!values.length) return NaN;
  const a = [...values].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function readCsvRows(csvPath) {
  const text = fs.readFileSync(csvPath, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  // skip header
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",").map((s) => s.trim());
    if (parts.length < 4) continue;
    const t = Number(parts[0]);
    const power = Number(parts[1]);
    const pFilt = Number(parts[2]);
    const pRaw = Number(parts[3]);
    if (!Number.isFinite(t)) continue;
    rows.push({ t, power, pFilt, pRaw });
  }
  return rows;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.csv) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, "..", "..");

  const csvPath = path.isAbsolute(args.csv) ? args.csv : path.join(repoRoot, args.csv);
  const segPath = args.segments
    ? (path.isAbsolute(args.segments) ? args.segments : path.join(repoRoot, args.segments))
    : csvPath.replace(/\.csv$/i, ".segments.json");

  if (!fs.existsSync(segPath)) {
    throw new Error(`Missing segments file: ${segPath}`);
  }

  const seg = JSON.parse(fs.readFileSync(segPath, "utf8"));
  const segments = Array.isArray(seg.segments) ? seg.segments : [];
  if (!segments.length) throw new Error("No segments in segments file");

  const rows = readCsvRows(csvPath);
  if (!rows.length) throw new Error("No rows in CSV");

  const base = path.basename(csvPath).replace(/\.csv$/i, "");
  const outDir = path.join(repoRoot, "results");
  ensureDir(outDir);
  const outPath = args.out || path.join(outDir, `${base}_summary.csv`);

  const out = fs.createWriteStream(outPath, { flags: "w" });
  out.write("segment_index,power_pct,P_peak,P_hold,deltaP,n_samples\n");

  for (const s of segments) {
    if (s.kind !== "step") continue; // metrics defined for step sweep
    const t0 = Number(s.start_ms);
    const power = Number(s.powerPct);
    const holdMs = Number(s.hold_ms);
    if (!Number.isFinite(t0) || !Number.isFinite(power) || !Number.isFinite(holdMs)) continue;

    const tEnd = t0 + holdMs;
    const inSeg = rows.filter((r) => r.t >= t0 && r.t <= tEnd);
    if (!inSeg.length) {
      out.write(`${s.index},${power},,,,\n`);
      continue;
    }

    // Peak within first 2s of the step
    const inFirst2s = inSeg.filter((r) => r.t <= t0 + 2000);
    const pPeak = Math.max(...inFirst2s.map((r) => r.pRaw));

    // Hold median from 5s to 8s
    const inHold = inSeg.filter((r) => r.t >= t0 + 5000 && r.t <= t0 + 8000);
    const pHold = median(inHold.map((r) => r.pRaw));

    const deltaP = pPeak - pHold;

    out.write(
      `${s.index},${power},${pPeak.toFixed(3)},${pHold.toFixed(3)},${deltaP.toFixed(3)},${inSeg.length}\n`,
    );
  }

  out.close();
  console.log(`[out] ${outPath}`);
}

main();


