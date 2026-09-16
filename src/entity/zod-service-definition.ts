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
