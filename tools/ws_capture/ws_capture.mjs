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
  if (n === 8)
    return "t_ms,stage_idx,power_pct,pressure_bar,target_pressure_bar,weight_g,flow_gps,resistance_bar_per_gps";
  return null;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function parseArgs(argv) {
  const args = {
    url: "ws://shotstopper-ws.local:81/ws",
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
      "  node ws_capture.mjs --url ws://<esp-ip>:81/ --name run1",
      "",
      "Options:",
      "  --url <wsUrl>     WebSocket URL (default: ws://autopump-profiler.local:81/)",
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

function handleLine(line) {
  // Always raw capture
  rawStream.write(line + "\n");

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
    process.stdout.write(ln + "\n");
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


