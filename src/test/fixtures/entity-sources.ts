import type { EntityMeta } from "../../thingworx";

export const thingShapeMeta: EntityMeta = {
  name: "MeterReadingShape",
  projectName: "TWLS.Demo",
  type: "ThingShape",
  parentType: "ThingShapes",
};

export const thingTemplateMeta: EntityMeta = {
  name: "MeterTemplate",
  projectName: "TWLS.Demo",
  type: "ThingTemplate",
  parentType: "ThingTemplates",
};

const lastModifiedDate = 1_752_492_733_000;

export const getReadingCode = "var reading = me.currentReading;\nvar result = reading;";
export const resetReadingCode = "me.currentReading = 0;";
export const getHistorySql =
  "SELECT * FROM MeterHistory WHERE meterId = :meterId ORDER BY timestamp;";
export const notifyCode = "me.SendAlert({ status: \"high-consumption\" });";

function serviceImplementation(service: {
  code?: string | string[];
  sql?: string;
}): unknown {
  const configurationTables: Record<string, unknown> = {};

  if (service.sql !== undefined) {
    configurationTables.Query = { rows: [{ sql: service.sql }] };
  }

  if (service.code !== undefined) {
    const codes = Array.isArray(service.code) ? service.code : [service.code];
    configurationTables.Script = { rows: codes.map((code) => ({ code })) };
  }

  return { configurationTables };
}

function makeThingShapeSource(
  services: Record<string, unknown>,
): unknown {
  return {
    name: thingShapeMeta.name,
    lastModifiedDate,
    serviceImplementations: services,
  };
}

function makeThingTemplateSource(
  services: Record<string, unknown>,
): unknown {
  return {
    name: thingTemplateMeta.name,
    lastModifiedDate,
    thingShape: { serviceImplementations: services },
  };
}

export const thingShapeSource = makeThingShapeSource({
  GetReading: serviceImplementation({ code: getReadingCode }),
  ResetReading: serviceImplementation({ code: resetReadingCode }),
});

export const thingTemplateSource = makeThingTemplateSource({
  GetHistory: serviceImplementation({ sql: getHistorySql }),
  Notify: serviceImplementation({ code: notifyCode }),
});

export const multiRowThingShapeSource = makeThingShapeSource({
  Broken: serviceImplementation({ code: ["a;", "b;"] }),
});

export const scriptLessThingShapeSource = makeThingShapeSource({
  Empty: serviceImplementation({}),
});

export const noServiceImplementationsThingShapeSource: unknown = {
  name: thingShapeMeta.name,
  lastModifiedDate,
};

export const dualTableThingTemplateSource = makeThingTemplateSource({
  Both: serviceImplementation({ code: "return 1;", sql: "SELECT 1;" }),
});

export const tablelessThingTemplateSource = makeThingTemplateSource({
  Empty: serviceImplementation({}),
});
