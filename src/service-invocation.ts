import type { ServiceDefinition } from "./core/entity/service-definition-schema";
import type { ServiceInvocationResult } from "./thingworx";

/**
 * Parses Postman-style raw JSON input for a service call body. Must be a
 * flat JSON object — ThingWorx service parameters are name-keyed — not an
 * array or primitive.
 */
export function parseServiceInvocationParams(
  raw: string,
): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      'Service parameters must be a JSON object, e.g. {"paramStr": "value"}.',
    );
  }

  return parsed as Record<string, unknown>;
}

/** Placeholder value per known base type, used only to seed the editable stub. */
const PLACEHOLDER_BY_BASE_TYPE: Record<string, unknown> = {
  STRING: "",
  NUMBER: 0,
  INTEGER: 0,
  BOOLEAN: false,
  DATETIME: "",
  INFOTABLE: {},
};

/**
 * Builds a JSON stub for a service's parameters from its known
 * `serviceDefinitions` signature. Falls back to `{}` when no definition was
 * pulled locally (older pull, or a service whose signature was never
 * edited) — this is a starting point for the user to edit, never a
 * validated payload.
 */
export function buildServiceInvocationStub(
  definition: ServiceDefinition | undefined,
): string {
  if (!definition) {
    return "{}";
  }

  const params = Object.values(definition.parameterDefinitions).sort(
    (a, b) => a.ordinal - b.ordinal,
  );

  const stub: Record<string, unknown> = {};
  for (const param of params) {
    stub[param.name] = PLACEHOLDER_BY_BASE_TYPE[param.baseType] ?? "";
  }

  return JSON.stringify(stub);
}

/** Formats an invocation result as a standalone document for display. */
export function formatServiceInvocationResult(
  thingName: string,
  serviceName: string,
  params: Record<string, unknown>,
  result: ServiceInvocationResult,
): string {
  return [
    `// ${result.ok ? "OK" : "FAILED"} — ${result.status} ${result.statusText}`,
    `// Thing: ${thingName}`,
    `// Service: ${serviceName}`,
    `// Request:`,
    JSON.stringify(params, null, 2),
    ``,
    `// Response:`,
    result.jsonBody !== undefined
      ? JSON.stringify(result.jsonBody, null, 2)
      : result.rawBody,
  ].join("\n");
}
