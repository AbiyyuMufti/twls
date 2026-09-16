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
