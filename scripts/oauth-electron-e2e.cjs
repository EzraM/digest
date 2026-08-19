const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const testDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "digest-oauth-e2e-"));

const packageResult = childProcess.spawnSync(
  process.platform === "win32" ? "yarn.cmd" : "yarn",
  ["electron-forge", "package"],
  { cwd: projectRoot, env: process.env, stdio: "inherit" }
);

if (packageResult.error) throw packageResult.error;
if (packageResult.status !== 0) process.exit(packageResult.status ?? 1);

// Launch the production bundles with the development Electron binary. This
// avoids a dev server and OS package-signing startup delays while exercising
// the same main, preload, and renderer output that Forge just packaged.
const electronEnv = {
  ...process.env,
  DIGEST_E2E: "oauth",
  DIGEST_USER_DATA_PATH: testDataPath,
  DIGEST_DATABASE_PATH: path.join(testDataPath, "digest.db"),
  GOOGLE_OAUTH_CLIENT_ID: "digest-e2e-client-id",
};
delete electronEnv.ELECTRON_RUN_AS_NODE;

const result = childProcess.spawnSync(require("electron"), [projectRoot], {
  cwd: projectRoot,
  env: electronEnv,
  encoding: "utf8",
  timeout: 30_000,
});

try {
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
  if (!(result.stdout ?? "").includes("OAuth Electron flow passed")) {
    throw new Error("OAuth Electron success marker was not emitted");
  }
} finally {
  fs.rmSync(testDataPath, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
}
