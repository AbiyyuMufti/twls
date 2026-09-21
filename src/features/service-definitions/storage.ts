import * as vscode from "vscode";
import yaml from "js-yaml";
import { EntityMeta } from "../../core/entity/entity";
import { buildArtifactRelativePath } from "../../core/utilities/artifact-path";
import {
  ServiceDefinition,
  serviceDefinitionAuthoringSchema,
} from "../../core/entity/service-definition-schema";
import { collapseServiceDefinition } from "./collapse";
import { expandServiceDefinition } from "./expand";
import { buildDefinitionHeaderComment } from "./templates";
import { warnDroppedCaseCollisions } from "../case-collision/warn";
import { dedupeByPreferredCase } from "../case-collision/detect";
const DEFINITION_EXTENSION = ".yaml";

export type QueryConfig = { timeout: number; maxItems: number };
/** Writes a service's lean YAML `.definition` sidecar to disk. */
export async function writeEntityServiceDefinition(
  rootUri: vscode.Uri,
  entityMeta: EntityMeta,
  serviceName: string,
  definition: ServiceDefinition,
  queryConfig?: QueryConfig,
): Promise<void> {
  const uri = vscode.Uri.joinPath(
    rootUri,
    ...buildArtifactRelativePath(
      entityMeta,
      "service",
      serviceName,
      DEFINITION_EXTENSION,
    ),
  );

  const authoring = collapseServiceDefinition(definition, queryConfig);
  const content = new TextEncoder().encode(
    buildDefinitionHeaderComment() + yaml.dump(authoring),
  );
  await vscode.workspace.fs.writeFile(uri, content);
}

/**
 * Writes `.definition` sidecars for a set of services. `getDefinition`/
 * `getQueryConfig` are passed in rather than an `Entity` directly so this
 * stays usable for both "every service on the entity" (pull) and any future
 * filtered subset, mirroring how `writeServices` takes a `Service[]` rather
 * than an `Entity`.
 */
export async function writeEntityServiceDefinitions(
  rootUri: vscode.Uri,
  entityMeta: EntityMeta,
  services: { name: string }[],
  getDefinition: (name: string) => ServiceDefinition | undefined,
  getQueryConfig: (name: string) => QueryConfig | undefined,
): Promise<number> {
  const { kept, dropped } = dedupeByPreferredCase(services);

  const results = await Promise.allSettled(
    kept.map(async (service) => {
      const definition = getDefinition(service.name);

      if (!definition) {
        return;
      }

      await writeEntityServiceDefinition(
        rootUri,
        entityMeta,
        service.name,
        definition,
        getQueryConfig(service.name),
      );
    }),
  );

  const numFulfilled = results.filter(
    (result) => result.status === "fulfilled",
  ).length;

  warnDroppedCaseCollisions(
    entityMeta,
    dropped.map((service) => ({ name: service.name, label: "definition" })),
  );

  return numFulfilled;
}

/**
 * Writes the given services to disk under `<root>/<project>/<entity>/`.
 * Returns how many of the writes succeeded.
/**
 * Reads and validates a service's `.definition` sidecar, expanding it back
 * into a full `ServiceDefinition`. Returns `undefined` if no sidecar file
 * exists for that service — that's the normal case for a service that was
 * pulled before this feature existed, or hasn't had its signature edited.
 */
export async function readEntityServiceDefinition(
  rootUri: vscode.Uri,
  entityMeta: EntityMeta,
  serviceName: string,
): Promise<
  { definition: ServiceDefinition; queryConfig?: QueryConfig } | undefined
> {
  const uri = vscode.Uri.joinPath(
    rootUri,
    ...buildArtifactRelativePath(
      entityMeta,
      "service",
      serviceName,
      DEFINITION_EXTENSION,
    ),
  );

  let content: Uint8Array;

  try {
    content = await vscode.workspace.fs.readFile(uri);
  } catch (error) {
    if (error instanceof vscode.FileSystemError) {
      return undefined;
    }
    throw error;
  }

  const raw = yaml.load(new TextDecoder().decode(content));
  const authoring = serviceDefinitionAuthoringSchema.parse(raw);

  const queryConfig =
    authoring.timeout !== undefined && authoring.maxItems !== undefined
      ? { timeout: authoring.timeout, maxItems: authoring.maxItems }
      : undefined;

  return {
    definition: expandServiceDefinition(serviceName, authoring),
    queryConfig,
  };
}
