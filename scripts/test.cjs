const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

require("ts-node/register/transpile-only");

const tests = [];
global.describe = (_name, body) => body();
global.it = (name, body) => tests.push({ name, body });

function partialMatch(actual, expected) {
  if (expected === null || typeof expected !== "object") {
    assert.deepStrictEqual(actual, expected);
    return;
  }
  assert.ok(actual !== null && typeof actual === "object");
  for (const [key, value] of Object.entries(expected)) {
    partialMatch(actual[key], value);
  }
}

global.expect = (actual) => {
  const matchers = {
    toBe: (expected) => assert.strictEqual(actual, expected),
    toBeUndefined: () => assert.strictEqual(actual, undefined),
    toEqual: (expected) => assert.deepStrictEqual(actual, expected),
    toMatchObject: (expected) => partialMatch(actual, expected),
    toContain: (expected) => assert.ok(actual.includes(expected)),
  };
  return {
    ...matchers,
    not: {
      toContain: (expected) => assert.ok(!actual.includes(expected)),
    },
  };
};

function findTests(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return findTests(target);
    return entry.name.endsWith(".test.ts") ? [target] : [];
  });
}

const requested = process.argv.slice(2);
const files = requested.length
  ? requested.map((file) => path.resolve(file))
  : findTests(path.resolve("src"));
for (const file of files) require(file);

(async () => {
  let failures = 0;
  for (const test of tests) {
    try {
      await test.body();
      process.stdout.write(`✓ ${test.name}\n`);
    } catch (error) {
      failures += 1;
      process.stderr.write(`✗ ${test.name}\n${error.stack ?? error}\n`);
    }
  }
  process.stdout.write(`\n${tests.length - failures}/${tests.length} tests passed\n`);
  process.exitCode = failures === 0 ? 0 : 1;
})();
