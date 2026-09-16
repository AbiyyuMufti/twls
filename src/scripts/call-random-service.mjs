#!/usr/bin/env node
// scripts/call-random-service.mjs
//
// Calls randomService on the TestTiming Thing.
//
// Usage:
//   node scripts/call-random-service.mjs
//   node scripts/call-random-service.mjs --root C:\path\to\f5-workspace

import { readFile } from "node:fs/promises";
import path from "node:path";

const THING_NAME = "TestTiming";
const SERVICE_NAME = "randomService";

async function loadConfig(rootDir) {
  const configPath = path.join(rootDir, ".twls", "thingworx.json");

  let content;

  try {
    content = await readFile(configPath, "utf8");
  } catch (error) {
    throw new Error(
      `Could not read ${configPath}. Run this from the workspace root that ` +
        `contains .twls/thingworx.json. (${error.message})`,
    );
  }

  return JSON.parse(content);
}

function extractRootFlag(argv) {
  const rootIndex = argv.indexOf("--root");

  if (rootIndex === -1) {
    return [argv, undefined];
  }

  const rootPath = argv[rootIndex + 1];

  if (!rootPath) {
    throw new Error("--root requires a path argument");
  }

  const remaining = [...argv.slice(0, rootIndex), ...argv.slice(rootIndex + 2)];

  return [remaining, rootPath];
}

function randomText() {
  return `random-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function main() {
  const [positional, explicitRoot] = extractRootFlag(process.argv.slice(2));

  if (positional.length > 0) {
    throw new Error("This script does not take positional arguments.");
  }

  const rootDir = explicitRoot ? path.resolve(explicitRoot) : process.cwd();
  const config = await loadConfig(rootDir);

  const paramStr = randomText();

  const url = new URL(
    `/Thingworx/Things/${THING_NAME}/Services/${SERVICE_NAME}`,
    config.baseUrl,
  );

  const response = await fetch(url, {
    method: "POST",
    headers: {
      appKey: config.appKey,
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-thingworx-session": "false",
    },
    body: JSON.stringify({
      paramStr,
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `POST failed (${response.status} ${response.statusText}): ${text}`,
    );
  }

  console.log(`Input : ${paramStr}`);
  console.log(`Output: ${text}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
