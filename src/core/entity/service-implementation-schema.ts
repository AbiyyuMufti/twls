import z from "zod";

export const scriptConfigurationTableSchema = z.looseObject({
  Script: z.looseObject({
    rows: z
      .array(
        z.looseObject({
          code: z.string(),
        }),
      )
      .length(1),
  }),
});

export const queryConfigurationTableSchema = z.looseObject({
  Query: z.looseObject({
    rows: z
      .array(
        z.looseObject({
          sql: z.string(),
          timeout: z.number().optional(),
          maxItems: z.number().optional(),
        }),
      )
      .length(1),
  }),
});

export const scriptServiceImplementationSchema = z.looseObject({
  configurationTables: scriptConfigurationTableSchema,
});

// Not used? :(
export const queryServiceImplementationSchema = z.looseObject({
  configurationTables: queryConfigurationTableSchema,
});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildScriptServiceImplementation(name: string, code: string) {
  return {
    name,
    description: "",
    handlerName: "Script",
    configurationTables: {
      Script: {
        isMultiRow: false,
        name: "Script",
        aspects: {},
        description: "",
        rows: [{ code }],
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

export type SqlHandlerName = "SQLQuery" | "SQLCommand";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildQueryServiceImplementation(
  name: string,
  sql: string,
  config: { timeout: number; maxItems: number },
  handlerName: SqlHandlerName = "SQLQuery",
) {
  return {
    name,
    description: "",
    allowOverride: false,
    handlerName,
    configurationTables: {
      Query: {
        description: handlerName,
        name: "Query",
        isMultiRow: false,
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
        rows: [{ sql, maxItems: config.maxItems, timeout: config.timeout }],
      },
    },
  };
}
