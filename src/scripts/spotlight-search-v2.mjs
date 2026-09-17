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

const headers = {
  appKey,
  Accept: "application/json",
  "Content-Type": "application/json",
  "x-thingworx-session": "false",
};

async function spotlightSearch(name, body, outputFile) {
  console.log();
  console.log(`=== ${name} ===`);
  console.log("POST", SERVICE_URL);
  console.log("Request:");
  console.log(JSON.stringify(body, null, 2));

  const response = await fetch(SERVICE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${name} failed (${response.status}): ${text}`);
  }

  const json = JSON.parse(text);

  const outputPath = path.join(root, ".twls", "inspect", outputFile);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(json, null, 2));

  console.log("Rows:", json.rows?.length ?? 0);

  for (const row of json.rows ?? []) {
    console.log(row.name, "| type:", row.type);
  }

  console.log(`Written to ${outputPath}`);

  return json;
}

// ---------------------------------------------------------
// 1. Search Things implementing ThingShape: test_timing
// ---------------------------------------------------------

await spotlightSearch(
  "ThingShape: test_timing",
  {
    searchExpression: "**",
    withPermissions: true,
    sortBy: "name",
    isAscending: true,
    searchDescriptions: true,
    includeInheritedThingShapes: true,

    types: {
      items: ["Thing"],
    },

    tags: [],

    thingTemplates: {
      excludedItems: [
        "Timer",
        "Scheduler",
        "GenericConnector",
        "IndustrialGateway",
      ],
    },

    thingShapes: {
      excludedItems: null,
      items: ["test_timing"],
    },

    entityContext: {
      type: "ThingShapes",
      name: "test_timing",
    },
  },
  "spotlight-search-v2-shape.json",
);

// ---------------------------------------------------------
// 2. Search Things implementing ThingTemplate:
//    TestThingTemplate
// ---------------------------------------------------------

await spotlightSearch(
  "ThingTemplate: TestThingTemplate",
  {
    searchExpression: "**",
    withPermissions: true,
    sortBy: "name",
    isAscending: true,
    searchDescriptions: true,
    includeInheritedThingShapes: true,

    types: {
      items: ["Thing"],
    },

    tags: [],

    thingTemplates: {
      excludedItems: null,
      items: ["TestThingTemplate"],
    },

    thingShapes: {
      excludedItems: ["Blog", "DataTable", "Stream", "ValueStream", "Wiki"],
    },

    entityContext: {
      type: "ThingTemplates",
      name: "TestThingTemplate",
    },
  },
  "spotlight-search-v2-template.json",
);
