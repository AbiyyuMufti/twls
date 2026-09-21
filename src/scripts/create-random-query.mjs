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

const ENTITY_TYPE = "ThingTemplates";
const ENTITY_NAME = "CADIT.Helper.BDB.TT";
const SERVICE_NAME = "MyNewQueryCommand";
const HANDLER_QUERY = "SQLQuery"; // "SQLQuery" for query
// const HANDLER_QUERY = "SQLCommand"; // "SQLCommand" for commands

const ENTITY_URL = `${baseUrl}/Thingworx/${ENTITY_TYPE}/${encodeURIComponent(ENTITY_NAME)}`;

const headers = {
  appKey,
  Accept: "application/json",
  "Content-Type": "application/json",
  "x-thingworx-session": "false",
};

// ---------------------------------------------------------
// GET entity
// ---------------------------------------------------------

console.log("GET", ENTITY_URL);

const response = await fetch(ENTITY_URL, {
  method: "GET",
  headers,
});

const text = await response.text();

if (!response.ok) {
  throw new Error(`GET entity failed (${response.status}): ${text}`);
}

const entity = JSON.parse(text);

console.log(`Creating service: ${SERVICE_NAME}`);

// ---------------------------------------------------------
// Service definition
// ---------------------------------------------------------

entity.thingShape ??= {};
entity.thingShape.serviceDefinitions ??= {};

entity.thingShape.serviceDefinitions[SERVICE_NAME] = {
  name: SERVICE_NAME,
  description: "",
  category: "",
  isAllowOverride: false,
  isLocalOnly: false,
  isOpen: false,
  isPrivate: false,
  sourceName: "",
  sourceType: "Unknown",
  parameterDefinitions: {},
  aspects: {
    isAsync: false,
  },
  resultType: {
    aspects: {},
    name: "result",
    description: "",
    baseType: "INFOTABLE",
  },
};

// ---------------------------------------------------------
// Service implementation
// ---------------------------------------------------------

entity.thingShape.serviceImplementations ??= {};

entity.thingShape.serviceImplementations[SERVICE_NAME] = {
  name: SERVICE_NAME,
  description: "",
  allowOverride: true,
  handlerName: HANDLER_QUERY,
  configurationTables: {
    Query: {
      description: HANDLER_QUERY,
      dataShape: {
        description: "",
        name: "",
        fieldDefinitions: {
          sql: {
            baseType: "STRING",
            description: "sql",
            name: "sql",
            aspects: {},
            ordinal: 0,
          },
          maxItems: {
            baseType: "NUMBER",
            description: "maxItems",
            name: "maxItems",
            aspects: {},
            ordinal: 1,
          },
          timeout: {
            baseType: "NUMBER",
            description: "timeout",
            name: "timeout",
            aspects: {},
            ordinal: 2,
          },
        },
      },
      isMultiRow: false,
      name: "Query",
      rows: [
        {
          sql: "SELECT 1 AS value",
          maxItems: 500,
          timeout: 60,
        },
      ],
    },
  },
};

// ---------------------------------------------------------
// PUT entity
// ---------------------------------------------------------

console.log("PUT", ENTITY_URL);

const updateResponse = await fetch(ENTITY_URL, {
  method: "PUT",
  headers,
  body: JSON.stringify(entity),
});

const updateText = await updateResponse.text();

console.log("PUT status:", updateResponse.status);
console.log("PUT response:", updateText);

if (!updateResponse.ok) {
  throw new Error(
    `PUT entity failed (${updateResponse.status}): ${updateText}`,
  );
}

// ---------------------------------------------------------
// Verify
// ---------------------------------------------------------

console.log();
console.log("Verifying...");

const verifyResponse = await fetch(ENTITY_URL, {
  method: "GET",
  headers,
});

const verifyText = await verifyResponse.text();

if (!verifyResponse.ok) {
  throw new Error(
    `Verification GET failed (${verifyResponse.status}): ${verifyText}`,
  );
}

const verifiedEntity = JSON.parse(verifyText);

const definition =
  verifiedEntity.thingShape?.serviceDefinitions?.[SERVICE_NAME];

const implementation =
  verifiedEntity.thingShape?.serviceImplementations?.[SERVICE_NAME];

console.log();
console.log("Service definition:", definition ? "FOUND" : "NOT FOUND");

console.log("Service implementation:", implementation ? "FOUND" : "NOT FOUND");

if (!definition || !implementation) {
  throw new Error(`Service "${SERVICE_NAME}" was not created.`);
}

console.log();
console.log(`Service "${SERVICE_NAME}" created successfully.`);
console.log("Handler: SQLQuery");
console.log("Query: SELECT 1 AS value");
