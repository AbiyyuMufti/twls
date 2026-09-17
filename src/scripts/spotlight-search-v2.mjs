// spotlight-search-v2.mjs

import fs from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);

const rootIndex = args.indexOf("--root");
const root =
  rootIndex !== -1 && args[rootIndex + 1]
    ? path.resolve(args[rootIndex + 1])
    : process.cwd();

const configPath = path.join(root, ".twls", "thingworx.json");
const config = JSON.parse(await fs.readFile(configPath, "utf8"));

const baseUrl = config.baseUrl.replace(/\/$/, "");
const appKey = config.appKey;

const SERVICE_URL = `${baseUrl}/Thingworx/Resources/SearchFunctions/Services/SpotlightSearchV2`;

const body = {
  searchExpression: "",
  types: {
    values: ["Thing"],
  },
  thingShapes: {
    values: ["test_timing"],
  },
  includeInheritedThingShapes: true,
  maxItems: 1000,
  maxSearchItems: 1000,
  sortBy: "name",
  isAscending: true,
};

console.log("POST", SERVICE_URL);
console.log("Request:");
console.log(JSON.stringify(body, null, 2));

const response = await fetch(SERVICE_URL, {
  method: "POST",
  headers: {
    appKey,
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-thingworx-session": "false",
  },
  body: JSON.stringify(body),
});

const text = await response.text();

if (!response.ok) {
  throw new Error(`SpotlightSearchV2 failed (${response.status}): ${text}`);
}

const json = JSON.parse(text);

const outputPath = path.join(
  root,
  ".twls",
  "inspect",
  "spotlight-search-v2.json",
);

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(json, null, 2));

console.log();
console.log("Top-level keys:", Object.keys(json));
console.log("Rows:", json.rows?.length ?? 0);

for (const row of json.rows ?? []) {
  console.log(row.name, "| type:", row.type);
}

console.log();
console.log(`Written to ${outputPath}`);
