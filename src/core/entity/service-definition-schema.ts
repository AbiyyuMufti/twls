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

/** Lean, human-authored parameter entry inside a `.yaml` file. */
export const parameterAuthoringSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string().default(""),
});

export type ParameterAuthoring = z.infer<typeof parameterAuthoringSchema>;

/**
 * Lean, human-authored shape of a `.yaml` sidecar file — what a user
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
 * Applies the lean authoring fields onto an existing server-side definition,
 * keeping everything the .yaml doesn't model (isAsync, defaultValue aspects,
 * isPrivate, ...).
 */
export function mergeServiceDefinition(
  existing: ServiceDefinition,
  incoming: ServiceDefinition,
): ServiceDefinition {
  const parameterDefinitions: Record<string, ParameterDefinition> = {};

  for (const [name, param] of Object.entries(incoming.parameterDefinitions)) {
    const old = existing.parameterDefinitions[name] as
      | (ParameterDefinition & { aspects?: unknown })
      | undefined;
    parameterDefinitions[name] = {
      ...param,
      ...(old?.aspects !== undefined ? { aspects: old.aspects } : {}),
    } as ParameterDefinition;
  }

  const oldResult = existing.resultType as ParameterDefinition & {
    aspects?: unknown;
  };

  return {
    ...existing,
    description: incoming.description,
    category: incoming.category,
    parameterDefinitions,
    resultType: {
      ...oldResult,
      baseType: incoming.resultType.baseType,
    },
  };
}
