/**
 * Fixture payloads for `serviceDefinitions` parsing, built from real
 * ThingWorx responses (redacted/trimmed for brevity where noted). Intended
 * to be merged into the project's existing `entity-sources.ts` fixture
 * file, following its established pattern of exporting raw JSON objects.
 */

/**
 * ThingShape with a single JS service that takes a string parameter and
 * returns a string. Matches a real fetched `ThingShapes/test_timing`
 * payload.
 */
export const thingShapeWithServiceDefinition = {
  name: "test_timing",
  lastModifiedDate: 1700000000000,
  serviceDefinitions: {
    testServiceWithParam: {
      isAllowOverride: false,
      isOpen: false,
      sourceType: "Unknown",
      parameterDefinitions: {
        stringParam: {
          name: "stringParam",
          aspects: {},
          description: "",
          baseType: "STRING",
          ordinal: 1,
        },
      },
      name: "testServiceWithParam",
      aspects: { isAsync: false },
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
    },
  },
  serviceImplementations: {
    testServiceWithParam: {
      name: "testServiceWithParam",
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
              code: "logger.info(stringParam);\nresult = string;\n",
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
    },
  },
  subscriptions: {},
};

/**
 * ThingTemplate mixing JS and SQL-backed services: one JS service with a
 * parameter, one SQL service with no parameters (INFOTABLE result), and one
 * SQL service with parameters spanning STRING/NUMBER/INTEGER/BOOLEAN/
 * DATETIME base types. Trimmed from real fetched payloads — the SQL
 * "with params" definition's key was aligned to its implementation's key
 * for fixture clarity (the two differed in the source server data, which
 * is itself worth being aware of as a real-world edge case, but isn't
 * exercised by this fixture).
 */
export const thingTemplateWithServiceDefinitions = {
  name: "TestThingTemplate",
  lastModifiedDate: 1700000000000,
  thingShape: {
    serviceDefinitions: {
      DebugGetEquipmentStatusByFilter: {
        isAllowOverride: false,
        isOpen: false,
        sourceType: "Unknown",
        parameterDefinitions: {
          equipmentIds: {
            name: "equipmentIds",
            aspects: {},
            description: "",
            baseType: "STRING",
            ordinal: 1,
          },
        },
        name: "DebugGetEquipmentStatusByFilter",
        aspects: { isAsync: false },
        isLocalOnly: false,
        description: "",
        isPrivate: false,
        sourceName: "",
        category: "Utility Parameter Overview",
        resultType: {
          name: "result",
          aspects: {},
          description: "",
          baseType: "STRING",
          ordinal: 0,
        },
      },
      GetLineMasterOee: {
        isAllowOverride: false,
        isOpen: false,
        sourceType: "Unknown",
        parameterDefinitions: {},
        name: "GetLineMasterOee",
        aspects: { isAsync: false },
        isLocalOnly: false,
        description: "",
        isPrivate: false,
        sourceName: "",
        category: "oee",
        resultType: {
          name: "result",
          aspects: {},
          description: "",
          baseType: "INFOTABLE",
          ordinal: 0,
        },
      },
      AddBMKComparisonMapping: {
        isAllowOverride: false,
        isOpen: false,
        sourceType: "Unknown",
        parameterDefinitions: {
          packingPlanResultId: {
            name: "packingPlanResultId",
            aspects: {},
            description: "",
            baseType: "INTEGER",
            ordinal: 1,
          },
          equipmentId: {
            name: "equipmentId",
            aspects: {},
            description: "",
            baseType: "INTEGER",
            ordinal: 3,
          },
          flavor: {
            name: "flavor",
            aspects: {},
            description: "",
            baseType: "STRING",
            ordinal: 8,
          },
          isProductive: {
            name: "isProductive",
            aspects: {},
            description: "",
            baseType: "BOOLEAN",
            ordinal: 21,
          },
          startTime: {
            name: "startTime",
            aspects: {},
            description: "",
            baseType: "DATETIME",
            ordinal: 5,
          },
        },
        name: "AddBMKComparisonMapping",
        aspects: { isAsync: false },
        isLocalOnly: false,
        description: "",
        isPrivate: false,
        sourceName: "",
        category: "oee",
        resultType: {
          name: "result",
          aspects: {},
          description: "",
          baseType: "INFOTABLE",
          ordinal: 0,
        },
      },
    },
    serviceImplementations: {
      DebugGetEquipmentStatusByFilter: {
        name: "DebugGetEquipmentStatusByFilter",
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
                code: "let parameterList = me.GetEquipmentStatusListByFilter({ equipmentIds: equipmentIds });",
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
      },
      GetLineMasterOee: {
        name: "GetLineMasterOee",
        description: "",
        handlerName: "SQLQuery",
        configurationTables: {
          Query: {
            isMultiRow: false,
            name: "Query",
            aspects: {},
            description: "SQLQuery",
            rows: [
              {
                maxItems: 0,
                timeout: 60,
                sql: 'SELECT line_id AS "lineId", line_name AS "lineName" FROM data',
              },
            ],
            dataShapeName: "",
            ordinal: 0,
            dataShape: {
              fieldDefinitions: {
                maxItems: {
                  name: "maxItems",
                  aspects: {},
                  description: "maxItems",
                  baseType: "NUMBER",
                  ordinal: 0,
                },
                timeout: {
                  name: "timeout",
                  aspects: {},
                  description: "timeout",
                  baseType: "NUMBER",
                  ordinal: 0,
                },
                sql: {
                  name: "sql",
                  aspects: {},
                  description: "sql",
                  baseType: "STRING",
                  ordinal: 0,
                },
              },
            },
          },
        },
      },
      AddBMKComparisonMapping: {
        name: "AddBMKComparisonMapping",
        description: "",
        handlerName: "SQLQuery",
        configurationTables: {
          Query: {
            isMultiRow: false,
            name: "Query",
            aspects: {},
            description: "SQLQuery",
            rows: [
              {
                maxItems: 0,
                timeout: 60,
                sql: "INSERT INTO oee.bmk_comparison_mappings (equipment_id, min_start_time) VALUES ([[equipmentId]], [[startTime]])",
              },
            ],
            dataShapeName: "",
            ordinal: 0,
            dataShape: {
              fieldDefinitions: {
                maxItems: {
                  name: "maxItems",
                  aspects: {},
                  description: "maxItems",
                  baseType: "NUMBER",
                  ordinal: 0,
                },
                timeout: {
                  name: "timeout",
                  aspects: {},
                  description: "timeout",
                  baseType: "NUMBER",
                  ordinal: 0,
                },
                sql: {
                  name: "sql",
                  aspects: {},
                  description: "sql",
                  baseType: "STRING",
                  ordinal: 0,
                },
              },
            },
          },
        },
      },
    },
    subscriptions: {},
  },
};
