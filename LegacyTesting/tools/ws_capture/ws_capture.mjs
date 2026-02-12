import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { WebSocket } from "ws";

const CSV_HEADER_PREFIXES = ["time_ms,", "t_ms,"];
const CSV_NUMERIC_ROW_RE = /^\s*[-0-9.]+(\s*,\s*[-0-9.]+)+\s*$/;

function isCsvHeader(line) {
  const s = line.trim().replace(/^\uFEFF/, "");
  return CSV_HEADER_PREFIXES.some((p) => s.startsWith(p));
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
  if (n === 8)
    return "t_ms,stage_idx,power_pct,pressure_bar,target_pressure_bar,weight_g,flow_gps,resistance_bar_per_gps";
  return null;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function parseArgs(argv) {
  const args = {
    // Arduino WebSocketsServer typically serves on the root path (no /ws).
    url: "ws://shotstopper-ws.local:81",
    out: "",
    raw: "",
    name: "",
    autoGo: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--url" && next) {
      args.url = next;
      i++;
    } else if (a === "--out" && next) {
      args.out = next;
      i++;
    } else if (a === "--raw" && next) {
      args.raw = next;
      i++;
    } else if (a === "--name" && next) {
      args.name = next;
      i++;
    } else if (a === "--auto-go") {
      args.autoGo = true;
    } else if (a === "--help" || a === "-h") {
      args.help = true;
    }
  }
  return args;
}

function usage() {
  console.log(
    [
      "ws_capture.mjs - WebSocket capture + command sender (no Serial)",
      "",
      "Usage:",
      "  node ws_capture.mjs --url ws://<esp-ip>:81 --name run1",
      "",
      "Options:",
      "  --url <wsUrl>     WebSocket URL (default: ws://shotstopper-ws.local:81)",
      "  --name <name>     Base filename (default: timestamped)",
      "  --out <csvPath>   Output CSV path (default: captures/<name>.csv)",
      "  --raw <rawPath>   Raw log path (default: captures/<name>.raw.log)",
      "  --auto-go         Send GO immediately after connect",
      "",
      "After start: type GO / STOP / STATUS in this terminal. Ctrl+C to exit.",
    ].join("\n"),
  );
}

const args = parseArgs(process.argv);
if (args.help) {
  usage();
  process.exit(0);
}

const ts = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\..+/, "")
  .replace("T", "_");

const name = args.name && args.name.trim() ? args.name.trim() : `capture_${ts}`;
const outCsv = args.out && args.out.trim() ? args.out.trim() : path.join("captures", `${name}.csv`);
const outRaw = args.raw && args.raw.trim() ? args.raw.trim() : path.join("captures", `${name}.raw.log`);

ensureDir(path.dirname(outCsv));
ensureDir(path.dirname(outRaw));

const csvStream = fs.createWriteStream(outCsv, { flags: "w" });
const rawStream = fs.createWriteStream(outRaw, { flags: "w" });

let headerSeen = false;
let shotActive = false;

function tryParseJsonLine(line) {
  const s = line.trim();
  if (!s.startsWith("{")) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function formatNum(x, digits = 2) {
  if (x === null || x === undefined) return "";
  const n = Number(x);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(digits);
}

function handleLine(line) {
  // Always raw capture
  rawStream.write(line + "\n");

  // If the device is sending JSON telemetry, only print once the shot is started.
  const msg = tryParseJsonLine(line);
  if (msg && typeof msg === "object") {
    const action = msg.action;
    const data = msg.data ?? {};

    if (action === "log_record") {
      // Always show logs so you can see whether GO actually triggered.
      const src = data.source ?? "device";
      const log = data.log ?? "";
      process.stdout.write(`[log:${src}] ${log}\n`);
      if (String(log).includes("[shot] GO")) shotActive = true;
      if (String(log).includes("[shot] STOP")) shotActive = false;
      return;
    }

    if (action === "sensor_data_update") {
      if (typeof data.brewActive === "boolean") shotActive = data.brewActive;
      // Suppress sensor spam by default; keep raw capture above.
      return;
    }

    if (action === "shot_data_update") {
      shotActive = true;
      if (!shotActive) return;
      // Compact single-line shot telemetry
      const t = formatNum(data.timeInShot, 0);
      const pt = data.profileTimeInShot !== undefined ? formatNum(data.profileTimeInShot, 0) : "";
      const p = formatNum(data.pressure, 2);
      const pf = formatNum(data.pumpFlow, 2);
      const wf = formatNum(data.weightFlow, 2);
      const w = formatNum(data.shotWeight, 2);
      const tp = formatNum(data.targetPressure, 2);
      const tf = formatNum(data.targetPumpFlow, 2);
      const wp = formatNum(data.waterPumped, 1);
      const phaseIdx = data.phaseIdx !== undefined ? String(data.phaseIdx) : "";
      const phaseType = data.phaseType ? String(data.phaseType) : "";
      const tip = data.timeInPhase !== undefined ? formatNum(data.timeInPhase, 0) : "";
      const clicks = data.pumpClicks !== undefined ? String(data.pumpClicks) : "";
      const cps = data.pumpCps !== undefined ? formatNum(data.pumpCps, 1) : "";
      const power = data.pumpPowerPct !== undefined ? formatNum(data.pumpPowerPct, 1) : "";
      process.stdout.write(
        `t_ms=${t}${pt ? ` profile_ms=${pt}` : ""} p=${p}bar pumpFlow=${pf}ml/s weight=${w}g weightFlow=${wf}g/s targetP=${tp}bar targetF=${tf}ml/s waterPumped=${wp}ml` +
          `${phaseIdx !== "" ? ` phase=${phaseIdx}` : ""}${phaseType ? `(${phaseType})` : ""}${tip ? ` tInPhase=${tip}` : ""}` +
          `${clicks !== "" ? ` clicks=${clicks}` : ""}${cps ? ` cps=${cps}` : ""}${power ? ` power=${power}%` : ""}\n`,
      );
      return;
    }

    // Unknown JSON action: ignore (raw capture still includes it)
    return;
  }

  // Plain-text STATUS replies (the ESP sends these as text, not JSON)
  if (/^\s*\[status\]/i.test(line.trim())) {
    process.stdout.write(line.trim() + "\n");
    return;
  }

  // Clean CSV capture
  if (isCsvHeader(line)) {
    csvStream.write(line.trim() + "\n");
    headerSeen = true;
    return;
  }

  if (isCsvNumericRow(line)) {
    if (!headerSeen) {
      const inferred = inferHeaderFromRow(line);
      if (inferred) {
        csvStream.write(inferred + "\n");
        headerSeen = true;
        console.log(`\n[csv] Missed device header; inferred and wrote: ${inferred}\n`);
      }
    }
    if (headerSeen) {
      csvStream.write(line.trim() + "\n");
    }
  }
}

console.log(`[ws] Connecting: ${args.url}`);
console.log(`[csv] ${outCsv}`);
console.log(`[raw] ${outRaw}`);

const ws = new WebSocket(args.url);

ws.on("open", () => {
  console.log("[ws] Connected");
  if (args.autoGo) {
    ws.send("GO");
    console.log("[tx] GO (auto)");
  }
  console.log("Type commands (GO/STOP/STATUS), Ctrl+C to exit\n");
});

ws.on("message", (data) => {
  const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
  // Some servers send multiple lines; split safely
  for (const ln of text.split(/\r?\n/)) {
    if (!ln) continue;
    handleLine(ln);
  }
});

ws.on("error", (err) => {
  console.error("[ws] Error:", err?.message ?? err);
});

ws.on("close", (code, reason) => {
  const r = reason ? reason.toString() : "";
  console.log(`[ws] Closed code=${code} reason=${r}`);
  try {
    csvStream.close();
    rawStream.close();
  } catch {
    // ignore
  }
  process.exit(0);
});

// interactive stdin -> ws
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on("line", (line) => {
  const s = line.trim();
  if (!s) return;
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(s);
    console.log(`[tx] ${s}`);
  } else {
    console.log("[tx] (not connected)");
  }
});

process.on("SIGINT", () => {
  console.log("\n[sys] Ctrl+C");
  try {
    rl.close();
  } catch {}
  try {
    ws.close(1000, "client exit");
  } catch {}
});


