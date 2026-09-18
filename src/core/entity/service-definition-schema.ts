import z from "zod";

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
