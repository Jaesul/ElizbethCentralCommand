import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs(argv) {
  const args = {
    url: "ws://shotstopper-ws.local:81/ws",
    name: "",
    mode: "sweep", // sweep | ramp
    target: 60,
    steps: "40,45,50,55,60,65,70,75",
    holdMs: 8000,
    offMs: 10000,
    rampMsList: "300,800,1500",
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--url" && next) {
      args.url = next;
      i++;
    } else if (a === "--name" && next) {
      args.name = next;
      i++;
    } else if (a === "--mode" && next) {
      args.mode = next;
      i++;
    } else if (a === "--target" && next) {
      args.target = Number(next);
      i++;
    } else if (a === "--steps" && next) {
      args.steps = next;
      i++;
    } else if (a === "--hold-ms" && next) {
      args.holdMs = Number(next);
      i++;
    } else if (a === "--off-ms" && next) {
      args.offMs = Number(next);
      i++;
    } else if (a === "--ramps-ms" && next) {
      args.rampMsList = next;
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
      "opv_runner.mjs - OPV characterization scheduler + capture",
      "",
      "Usage:",
      "  node opv_runner.mjs --mode sweep --name run1",
      "  node opv_runner.mjs --mode ramp --target 60 --name ramp1",
      "",
      "Options:",
      "  --url <wsUrl>        default: ws://shotstopper-ws.local:81/ws",
      "  --name <baseName>    default: timestamped",
      "  --mode sweep|ramp    default: sweep",
      "  --steps 40,45,...    sweep steps (pct)",
      "  --hold-ms 8000       per-step hold",
      "  --off-ms 10000       between-step off",
      "  --target 60          ramp target power",
      "  --ramps-ms 300,800,1500  ramp durations",
      "",
      "Outputs:",
      "  captures/<name>.csv",
      "  captures/<name>.raw.log",
      "  captures/<name>.segments.json",
    ].join("\n"),
  );
}

function nowStamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "_");
}

function median(values) {
  if (!values.length) return NaN;
  const a = [...values].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function parseDeviceJson(line) {
  try {
    const obj = JSON.parse(line);
    if (obj && typeof obj === "object") return obj;
  } catch {
    // ignore
  }
  return null;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const args = parseArgs(process.argv);
if (args.help) {
  usage();
  process.exit(0);
}

const ts = nowStamp();
const name = args.name && args.name.trim() ? args.name.trim() : `opv_${ts}`;

const outDir = path.join(repoRoot, "captures");
ensureDir(outDir);

const csvPath = path.join(outDir, `${name}.csv`);
const rawPath = path.join(outDir, `${name}.raw.log`);
const segPath = path.join(outDir, `${name}.segments.json`);

const csv = fs.createWriteStream(csvPath, { flags: "w" });
const raw = fs.createWriteStream(rawPath, { flags: "w" });

csv.write("timestamp_ms,pump_power_pct,pressure_bar,pressure_bar_raw\n");

const segments = [];
let lastTelemetry = null; // {timestamp_ms,...}

function logRaw(s) {
  raw.write(s + "\n");
}

function onLine(line) {
  logRaw(line);
  const obj = parseDeviceJson(line);
  if (!obj) return;

  // Ignore ACK responses (they won't have timestamp_ms)
  if (typeof obj.timestamp_ms !== "number") return;

  const t = Math.round(obj.timestamp_ms);
  const p = Math.round(obj.pumpPowerPct ?? obj.pump_power_pct ?? 0);
  const pf = Number(obj.pressureBar ?? obj.pressure_bar ?? NaN);
  const pr = Number(obj.pressureBarRaw ?? obj.pressure_bar_raw ?? NaN);
  if (!Number.isFinite(t)) return;

  lastTelemetry = { t, p, pf, pr };
  csv.write(`${t},${p},${pf.toFixed(3)},${pr.toFixed(3)}\n`);
}

function wsSend(ws, obj) {
  const s = JSON.stringify(obj);
  ws.send(s);
  logRaw(`[tx] ${s}`);
}

async function waitForTelemetry(timeoutMs = 5000) {
  const start = Date.now();
  while (!lastTelemetry) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for telemetry");
    await sleep(25);
  }
  return lastTelemetry;
}

async function setPower(ws, powerPct) {
  const p = Math.max(0, Math.min(100, Math.round(powerPct)));
  wsSend(ws, { command: "setPower", powerPct: p });
}

async function startPump(ws) {
  wsSend(ws, { command: "startPump" });
}

async function stopPump(ws) {
  wsSend(ws, { command: "stopPump" });
}

async function runSweep(ws) {
  const steps = String(args.steps)
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));

  await waitForTelemetry(7000);

  // Start pump once, then rely on power=0 between steps.
  await startPump(ws);
  await sleep(800);

  for (let i = 0; i < steps.length; i++) {
    const power = steps[i];
    const t0 = (await waitForTelemetry()).t;
    segments.push({
      kind: "step",
      index: i,
      powerPct: power,
      start_ms: t0,
      hold_ms: args.holdMs,
      off_ms: args.offMs,
    });

    logRaw(`[segment] step index=${i} power=${power} start_ms=${t0}`);
    await setPower(ws, power);
    await sleep(args.holdMs);

    await setPower(ws, 0);
    await sleep(args.offMs);
  }

  await stopPump(ws);
  await setPower(ws, 0);
}

async function runRamp(ws) {
  const target = Math.max(0, Math.min(100, Math.round(args.target)));
  const ramps = String(args.rampMsList)
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));

  await waitForTelemetry(7000);

  for (let i = 0; i < ramps.length; i++) {
    const rampMs = ramps[i];

    await startPump(ws);
    await sleep(800);
    await setPower(ws, 0);
    await sleep(200);

    const t0 = (await waitForTelemetry()).t;
    segments.push({
      kind: "ramp",
      index: i,
      targetPowerPct: target,
      ramp_ms: rampMs,
      start_ms: t0,
      hold_ms: args.holdMs,
      off_ms: args.offMs,
    });
    logRaw(`[segment] ramp index=${i} target=${target} ramp_ms=${rampMs} start_ms=${t0}`);

    // Ramp by sending setPower every 50ms (matches telemetry cadence)
    const stepEveryMs = 50;
    const steps = Math.max(1, Math.round(rampMs / stepEveryMs));
    for (let k = 1; k <= steps; k++) {
      const p = (target * k) / steps;
      await setPower(ws, p);
      await sleep(stepEveryMs);
    }
    await setPower(ws, target);

    await sleep(args.holdMs);
    await setPower(ws, 0);
    await stopPump(ws);
    await sleep(args.offMs);
  }

  await setPower(ws, 0);
}

async function main() {
  console.log(`[ws] connecting ${args.url}`);
  console.log(`[out] ${csvPath}`);
  console.log(`[raw] ${rawPath}`);
  console.log(`[root] ${repoRoot}`);

  const ws = new WebSocket(args.url);

  ws.on("message", (data) => {
    const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
    for (const ln of text.split(/\r?\n/)) {
      if (!ln) continue;
      onLine(ln);
    }
  });

  ws.on("error", (e) => {
    console.error("[ws] error", e?.message ?? e);
  });

  await new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("close", () => reject(new Error("WebSocket closed before open")));
  });

  console.log("[ws] connected");
  logRaw(`[rx] connected url=${args.url}`);

  try {
    if (args.mode === "sweep") {
      await runSweep(ws);
    } else if (args.mode === "ramp") {
      await runRamp(ws);
    } else {
      throw new Error(`Unknown mode: ${args.mode} (use sweep|ramp)`);
    }
  } finally {
    fs.writeFileSync(segPath, JSON.stringify({ name, url: args.url, segments }, null, 2));
    console.log(`[segments] ${segPath}`);
    try {
      ws.close(1000, "done");
    } catch {}
    try {
      csv.close();
      raw.close();
    } catch {}
  }
}

main().catch((e) => {
  console.error("[fatal]", e?.stack ?? e);
  process.exit(1);
});


