import yaml from "js-yaml";
import { KNOWN_BASE_TYPES } from "../../core/entity/service-definition-schema";

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
