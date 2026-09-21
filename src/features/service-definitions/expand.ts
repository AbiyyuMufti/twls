import {
  ParameterDefinition,
  ServiceDefinition,
  ServiceDefinitionAuthoring,
} from "../../core/entity/service-definition-schema";

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
      aspects: {},
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
      aspects: {},
    },
    aspects: { isAsync: false },
  } as ServiceDefinition;
}
