import yaml from "js-yaml";
import {
  KNOWN_BASE_TYPES,
  ServiceDefinition,
} from "../../core/entity/service-definition-schema";
import { collapseServiceDefinition } from "./collapse";

export const DEFINITION_EXTENSION = ".yaml";

export function buildDefinitionHeaderComment(): string {
  return [
    "# Service definition — edited locally, pushed together with the code file.",
    `# Known base types so far: ${KNOWN_BASE_TYPES.join(", ")}`,
    "# (Other server-side types may exist; they aren't rejected here, just unverified.)",
    "",
  ].join("\n");
}

/** Boilerplate `.yaml` YAML content for a brand-new service. */
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

/**
 * Canonical on-disk text of a service's `.yaml` sidecar. Shared by the pull
 * writer, the dirty check and the remote diff provider so "what the file
 * should look like" can't drift between them.
 */
export function buildServiceDefinitionYaml(
  definition: ServiceDefinition,
  queryConfig?: { timeout: number; maxItems: number },
): string {
  return (
    buildDefinitionHeaderComment() +
    yaml.dump(collapseServiceDefinition(definition, queryConfig))
  );
}
