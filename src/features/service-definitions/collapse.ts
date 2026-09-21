import {
  ServiceDefinition,
  ServiceDefinitionAuthoring,
} from "../../core/entity/service-definition-schema";

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
