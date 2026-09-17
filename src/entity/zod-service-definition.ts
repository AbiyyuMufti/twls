import z from "zod";
import yaml from "js-yaml";

export const parameterDefinitionSchema = z.looseObject({
  name: z.string(),
  description: z.string(),
  baseType: z.string(),
  ordinal: z.number(),
});

export type ParameterDefinition = z.infer<typeof parameterDefinitionSchema>;

export const serviceDefinitionSchema = z.looseObject({
  name: z.string(),
  description: z.string(),
  category: z.string(),
  isAllowOverride: z.boolean(),
  isOpen: z.boolean(),
  isLocalOnly: z.boolean(),
  isPrivate: z.boolean(),
  sourceType: z.string(),
  sourceName: z.string(),
  parameterDefinitions: z.record(z.string(), parameterDefinitionSchema),
  resultType: parameterDefinitionSchema,
});

export type ServiceDefinition = z.infer<typeof serviceDefinitionSchema>;

export const serviceDefinitionsSchema = z.record(
  z.string(),
  serviceDefinitionSchema,
);

/**
 * Base types confirmed against real ThingWorx payloads so far. This is a
 * soft authoring hint only — NOT enforced as a hard enum anywhere on the
 * underlying `serviceDefinitionSchema`, since rejecting an unconfirmed base
 * type would break parsing for a real entity using one we haven't seen yet.
 */
export const KNOWN_BASE_TYPES = [
  "STRING",
  "NUMBER",
  "INTEGER",
  "BOOLEAN",
  "DATETIME",
  "INFOTABLE",
] as const;

/** Lean, human-authored parameter entry inside a `.definition` file. */
export const parameterAuthoringSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string().default(""),
});

export type ParameterAuthoring = z.infer<typeof parameterAuthoringSchema>;

/**
 * Lean, human-authored shape of a `.definition` sidecar file — what a user
 * actually edits, as opposed to the full `ServiceDefinition` ThingWorx
 * expects. `timeout`/`maxItems` are SQL-only (they live on the
 * implementation's Query row server-side, not the definition) and are
 * simply absent from the file for JS services.
 */
export const serviceDefinitionAuthoringSchema = z.object({
  description: z.string().default(""),
  category: z.string().default(""),
  params: z.array(parameterAuthoringSchema).default([]),
  result: z.string(),
  timeout: z.number().optional(),
  maxItems: z.number().optional(),
});

export type ServiceDefinitionAuthoring = z.infer<
  typeof serviceDefinitionAuthoringSchema
>;

/**
 * Expands the lean authoring shape into a full `ServiceDefinition`, filling
 * in the boilerplate ThingWorx fields with the same defaults confirmed
 * working in create-random-service.mjs (isAllowOverride: false, isOpen:
 * false, sourceType: "Unknown", etc.).
 */
export function expandServiceDefinition(
  name: string,
  authoring: ServiceDefinitionAuthoring,
): ServiceDefinition {
  const parameterDefinitions: Record<string, ParameterDefinition> = {};

  authoring.params.forEach((param, index) => {
    parameterDefinitions[param.name] = {
      name: param.name,
      description: param.description,
      baseType: param.type,
      ordinal: index + 1,
    };
  });

  return {
    name,
    description: authoring.description,
    category: authoring.category,
    isAllowOverride: false,
    isOpen: false,
    isLocalOnly: false,
    isPrivate: false,
    sourceType: "Unknown",
    sourceName: "",
    parameterDefinitions,
    resultType: {
      name: "result",
      description: "",
      baseType: authoring.result,
      ordinal: 0,
    },
  } as ServiceDefinition;
}

/**
 * Collapses a full `ServiceDefinition` — plus, for SQL services, its Query
 * row's timeout/maxItems — back into the lean authoring shape written to
 * disk on pull.
 */
export function collapseServiceDefinition(
  definition: ServiceDefinition,
  queryConfig?: { timeout: number; maxItems: number },
): ServiceDefinitionAuthoring {
  const params = Object.values(definition.parameterDefinitions)
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((param) => ({
      name: param.name,
      type: param.baseType,
      description: param.description,
    }));

  return {
    description: definition.description,
    category: definition.category,
    params,
    result: definition.resultType.baseType,
    ...(queryConfig ?? {}),
  };
}

export function buildDefinitionHeaderComment(): string {
  return [
    "# Service definition — edited locally, pushed together with the code file.",
    `# Known base types so far: ${KNOWN_BASE_TYPES.join(", ")}`,
    "# (Other server-side types may exist; they aren't rejected here, just unverified.)",
    "",
  ].join("\n");
}

/** Boilerplate `.definition` YAML content for a brand-new service. */
export function buildServiceDefinitionTemplate(kind: "js" | "sql"): string {
  const starter = {
    description: "",
    category: "",
    params: [],
    result: "STRING",
    ...(kind === "sql" ? { timeout: 60, maxItems: 0 } : {}),
  };

  return buildDefinitionHeaderComment() + yaml.dump(starter);
}
