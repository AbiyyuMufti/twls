#!/usr/bin/env node
// scripts/create-random-service.mjs
//
// Creates/updates randomService on the test_timing ThingShape.
//
// Service:
//   randomService(paramStr: STRING): STRING
//
// Implementation:
//   result = paramStr;
//
// Usage:
//   node scripts/create-random-service.mjs
//   node scripts/create-random-service.mjs --root C:\path\to\f5-workspace

import { readFile } from "node:fs/promises";
import path from "node:path";

const ENTITY_TYPE = "ThingShapes";
const ENTITY_NAME = "test_timing";
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

function createServiceDefinition() {
  return {
    isAllowOverride: false,
    isOpen: false,
    sourceType: "Unknown",
    parameterDefinitions: {
      paramStr: {
        name: "paramStr",
        aspects: {},
        description: "",
        baseType: "STRING",
        ordinal: 1,
      },
    },
    name: SERVICE_NAME,
    aspects: {
      isAsync: false,
    },
    isLocalOnly: false,
    description: "",
    isPrivate: false,
    sourceName: "",
    category: "",
    resultType: {
      name: "result",
      aspects: {},
      description: "",
      baseType: "STRING",
      ordinal: 0,
    },
  };
}

function createServiceImplementation() {
  return {
    name: SERVICE_NAME,
    description: "",
    handlerName: "Script",
    configurationTables: {
      Script: {
        isMultiRow: false,
        name: "Script",
        aspects: {},
        description: "",
        rows: [
          {
            code: "result = paramStr;",
          },
        ],
        dataShapeName: "",
        ordinal: 0,
        dataShape: {
          fieldDefinitions: {
            code: {
              name: "code",
              aspects: {},
              description: "code",
              baseType: "STRING",
              ordinal: 0,
            },
          },
        },
      },
    },
  };
}

async function main() {
  const rootDir = process.argv.includes("--root")
    ? path.resolve(process.argv[process.argv.indexOf("--root") + 1])
    : process.cwd();

  const config = await loadConfig(rootDir);

  const url = new URL(
    `/Thingworx/${ENTITY_TYPE}/${ENTITY_NAME}`,
    config.baseUrl,
  );

  const headers = {
    appKey: config.appKey,
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-thingworx-session": "false",
  };

  console.log(`Fetching ${ENTITY_TYPE}/${ENTITY_NAME}...`);

  const getResponse = await fetch(url, {
    method: "GET",
    headers,
  });

  if (!getResponse.ok) {
    const text = await getResponse.text();

    throw new Error(
      `GET failed (${getResponse.status} ${getResponse.statusText}): ${text}`,
    );
  }

  const entity = await getResponse.json();

  if (!entity.serviceDefinitions) {
    entity.serviceDefinitions = {};
  }

  if (!entity.serviceImplementations) {
    entity.serviceImplementations = {};
  }

  entity.serviceDefinitions[SERVICE_NAME] = createServiceDefinition();
  entity.serviceImplementations[SERVICE_NAME] = createServiceImplementation();

  console.log(`Writing ${SERVICE_NAME}...`);

  const putResponse = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify(entity),
  });

  if (!putResponse.ok) {
    const text = await putResponse.text();

    throw new Error(
      `PUT failed (${putResponse.status} ${putResponse.statusText}): ${text}`,
    );
  }

  console.log(
    `Created/updated ${SERVICE_NAME} on ${ENTITY_TYPE}/${ENTITY_NAME}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
