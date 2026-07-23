const fs = require("node:fs");
const path = require("node:path");

const port = Number(process.env.DIGEST_REMOTE_DEBUGGING_PORT || 9222);
const durationSeconds = Number(process.argv[2] || 10);

if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 120) {
  console.error("Usage: yarn profile:capture [duration-seconds]");
  process.exit(1);
}

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const withTimeout = (promise, milliseconds, message) =>
  Promise.race([
    promise,
    delay(milliseconds).then(() => {
      throw new Error(message);
    }),
  ]);

async function findMainRenderer() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) {
    throw new Error(`CDP target list returned HTTP ${response.status}`);
  }

  const targets = await response.json();
  const pages = targets.filter(
    (target) => target.type === "page" && target.webSocketDebuggerUrl
  );
  const mainRenderer =
    pages.find((target) => target.url.includes("localhost:5173")) ||
    pages.find((target) => target.url.includes("127.0.0.1:5173")) ||
    pages.find((target) => !target.url.startsWith("devtools://"));

  if (!mainRenderer) {
    throw new Error(
      `No renderer target found. Available targets: ${targets
        .map((target) => `${target.type}:${target.url}`)
        .join(", ")}`
    );
  }
  return mainRenderer;
}

function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 1;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) {
      request.reject(new Error(message.error.message));
    } else {
      request.resolve(message.result);
    }
  });

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error("Failed to connect to the renderer CDP socket")),
      { once: true }
    );
  });

  return {
    async send(method, params = {}) {
      await opened;
      const id = nextId++;
      const result = new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
      socket.send(JSON.stringify({ id, method, params }));
      return result;
    },
    close() {
      socket.close();
    },
  };
}

function summarize(profile) {
  const nodesById = new Map(profile.nodes.map((node) => [node.id, node]));
  const sampleCounts = new Map();
  for (const nodeId of profile.samples || []) {
    sampleCounts.set(nodeId, (sampleCounts.get(nodeId) || 0) + 1);
  }

  const totalSamples = Math.max(profile.samples?.length || 0, 1);
  return [...sampleCounts.entries()]
    .map(([nodeId, samples]) => {
      const frame = nodesById.get(nodeId)?.callFrame || {};
      return {
        samples,
        percent: (samples / totalSamples) * 100,
        functionName: frame.functionName || "(anonymous)",
        url: frame.url || "(native/runtime)",
        line: (frame.lineNumber ?? -1) + 1,
        column: (frame.columnNumber ?? -1) + 1,
      };
    })
    .sort((left, right) => right.samples - left.samples)
    .slice(0, 40);
}

function writeSummary(filePath, target, duration, rows) {
  const lines = [
    "# Digest renderer CPU profile",
    "",
    `Target: ${target.title || "(untitled)"}`,
    "",
    `URL: ${target.url}`,
    "",
    `Capture duration: ${duration} seconds`,
    "",
    "| Self % | Samples | Function | Location |",
    "| ---: | ---: | --- | --- |",
    ...rows.map((row) => {
      const location =
        row.url === "(native/runtime)"
          ? row.url
          : `${row.url}:${row.line}:${row.column}`;
      return `| ${row.percent.toFixed(2)} | ${row.samples} | \`${row.functionName.replaceAll("`", "'")}\` | ${location.replaceAll("|", "\\|")} |`;
    }),
    "",
  ];
  fs.writeFileSync(filePath, lines.join("\n"));
}

async function main() {
  let target;
  try {
    target = await findMainRenderer();
  } catch (error) {
    throw new Error(
      `${error.message}\nStart Digest first with: yarn start:profile`
    );
  }

  const client = createCdpClient(target.webSocketDebuggerUrl);
  await client.send("Debugger.enable");
  await client.send("Profiler.enable");
  await client.send("Profiler.setSamplingInterval", { interval: 500 });

  console.log(`Connected to: ${target.title || target.url}`);
  console.log(
    `Starting a ${durationSeconds}-second capture. Paste the problematic link now.`
  );
  await client.send("Profiler.start");

  for (let remaining = durationSeconds; remaining > 0; remaining--) {
    process.stdout.write(`\rCapturing… ${remaining}s remaining `);
    await delay(1000);
  }

  // Debugger.pause is an inspector interrupt, so it can break into a renderer
  // that is spinning in JavaScript long enough for Profiler.stop to complete.
  // A bounded timeout prevents the capture CLI from hanging indefinitely if
  // Chromium cannot service even the interrupt.
  let paused = false;
  try {
    await withTimeout(
      client.send("Debugger.pause"),
      5000,
      "The renderer did not respond to Debugger.pause"
    );
    paused = true;
    const { profile } = await withTimeout(
      client.send("Profiler.stop"),
      10000,
      "The renderer did not respond to Profiler.stop"
    );
    await client.send("Profiler.disable");
    if (paused) {
      await client.send("Debugger.resume");
      paused = false;
    }
    await client.send("Debugger.disable");
    client.close();
    process.stdout.write("\n");

    const outputDirectory = path.resolve(".tmp", "perf");
    fs.mkdirSync(outputDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replaceAll(":", "-");
    const profilePath = path.join(outputDirectory, `paste-freeze-${timestamp}.cpuprofile`);
    const summaryPath = path.join(outputDirectory, `paste-freeze-${timestamp}.md`);
    fs.writeFileSync(profilePath, JSON.stringify(profile));
    writeSummary(
      summaryPath,
      target,
      durationSeconds,
      summarize(profile)
    );

    console.log(`Raw profile: ${profilePath}`);
    console.log(`Summary:     ${summaryPath}`);
  } finally {
    if (paused) {
      await withTimeout(client.send("Debugger.resume"), 2000, "resume timed out").catch(
        () => {}
      );
    }
    client.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
