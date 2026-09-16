#!/usr/bin/env node
// scripts/fetch-entity.mjs
//
// Fetches a full ThingWorx entity's raw JSON and writes it to a file so it
// can be inspected without VS Code's dev-tools console truncating it.
// Reads baseUrl/appKey from the workspace's .twls/thingworx.json, same as
// the extension does — no separate credentials to maintain.
//
// Usage:
//   node scripts/fetch-entity.mjs <ParentType> <EntityName> [outFile] [--root <path>]
//
// By default, .twls/thingworx.json is looked up relative to the current
// working directory (i.e. `cd` into the workspace opened by F5 before
// running this). Use --root to point at that workspace explicitly instead,
// e.g. when running from the extension project's own terminal:
//
// Examples:
//   node scripts/fetch-entity.mjs ThingShapes MMTH.SCM.MRP.eMPISProcessing.ThingShape
//   node scripts/fetch-entity.mjs ThingTemplates MyTemplate ./out.json
//   node scripts/fetch-entity.mjs ThingShapes MyEntity --root C:\path\to\f5-workspace
//
// Requires Node 18+ (built-in fetch).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

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

function printSummary(json) {
  console.log(`Top-level keys: ${Object.keys(json).join(", ")}`);

  // Best-effort peek at likely definition/implementation containers, since
  // these are exactly the fields we're trying to learn the shape of.
  for (const key of [
    "serviceDefinitions",
    "serviceImplementations",
    "subscriptions",
    "thingShape",
  ]) {
    if (json[key] && typeof json[key] === "object") {
      const nested = Object.keys(json[key]);
      console.log(
        `  ${key}: ${nested.length} entr${nested.length === 1 ? "y" : "ies"}` +
          (nested.length ? ` (e.g. "${nested[0]}")` : ""),
      );
    }
  }
}

/** Pulls `--root <path>` out of argv, returning [remainingArgs, rootPath]. */
function extractRootFlag(argv) {
  const rootIndex = argv.indexOf("--root");

  if (rootIndex === -1) {
    return [argv, undefined];
  }

  const rootPath = argv[rootIndex + 1];

  if (!rootPath) {
    throw new Error("--root requires a path argument");
  }

  const remaining = [
    ...argv.slice(0, rootIndex),
    ...argv.slice(rootIndex + 2),
  ];

  return [remaining, rootPath];
}

async function main() {
  const [positional, explicitRoot] = extractRootFlag(process.argv.slice(2));
  const [parentType, entityName, outArg] = positional;

  if (!parentType || !entityName) {
    console.error(
      "Usage: node scripts/fetch-entity.mjs <ParentType> <EntityName> [outFile] [--root <path>]",
    );
    console.error(
      "Example: node scripts/fetch-entity.mjs ThingShapes MMTH.SCM.MRP.eMPISProcessing.ThingShape",
    );
    console.error(
      "         node scripts/fetch-entity.mjs ThingShapes MyEntity --root C:\\path\\to\\f5-workspace",
    );
    process.exitCode = 1;
    return;
  }

  const rootDir = explicitRoot ? path.resolve(explicitRoot) : process.cwd();
  const config = await loadConfig(rootDir);

  const url = new URL(`/Thingworx/${parentType}/${entityName}`, config.baseUrl);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      appKey: config.appKey,
      Accept: "application/json",
      "x-thingworx-session": "false",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(
      `Request failed (${response.status} ${response.statusText}): ${text}`,
    );
    process.exitCode = 1;
    return;
  }

  const json = await response.json();

  const outDir = path.join(rootDir, ".twls", "inspect");
  await mkdir(outDir, { recursive: true });

  const outFile = outArg
    ? path.resolve(outArg)
    : path.join(outDir, `${entityName}.json`);

  await writeFile(outFile, JSON.stringify(json, null, 2), "utf8");

  console.log(`Wrote full entity JSON to: ${outFile}`);
  printSummary(json);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
