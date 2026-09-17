import http from "node:http";
import path from "node:path";
import * as vscode from "vscode";
import yaml from "js-yaml";
import z from "zod";
import { Config } from "./config";
import {
  Entity,
  EntityMeta,
  entityMap,
  entityMetaSchema,
  Service,
  localServiceSchema,
  Subscription,
  localSubscriptionSchema,
} from "./entity/entity";

import {
  buildEntityPickItem,
  buildProjectPickItem,
  type MetaPickItem,
} from "./pick-item";

import {
  buildArtifactFolderRelativePath,
  buildArtifactRelativePath,
} from "./artifact-path";
import {
  buildDefinitionHeaderComment,
  collapseServiceDefinition,
  expandServiceDefinition,
  ServiceDefinition,
  serviceDefinitionAuthoringSchema,
} from "./entity/zod-service-definition";
import { warnCaseCollisions } from "./warn-case-collision";

/**
 * ThingWorx REST client: talks to the ThingWorx server (search, fetch, push,
 * local read/write helpers) via {@link thingworxFetch} with the configured application key.
 */

const projectParentTypes = {
  Project: "Projects",
} as const;

const projectTypes = Object.keys(projectParentTypes) as unknown as readonly [
  keyof typeof projectParentTypes,
];

const projParentTypes = Object.values(
  projectParentTypes,
) as unknown as readonly [
  (typeof projectParentTypes)[keyof typeof projectParentTypes],
];

/** Identifies a ThingWorx project, the container that entities are grouped in. */
export const projectMetaSchema = z.object({
  name: z.string(),
  projectName: z.string(),
  type: z.enum(projectTypes),
  parentType: z.enum(projParentTypes),
});

export type ProjectMeta = z.infer<typeof projectMetaSchema>;

const DEFINITION_EXTENSION = ".yaml";

export type QueryConfig = { timeout: number; maxItems: number };

/**
 * Opens a QuickPick that live-searches entities and resolves to the picked
 * {@link EntityMeta} (or `undefined` when the picker is dismissed).
 */
export function showEntityMetaPick(
  config: Config,
  options: Pick<vscode.QuickPickOptions, "placeHolder" | "ignoreFocusOut">,
): Promise<EntityMeta | undefined> {
  return showMetaQuickPick<EntityMeta>(
    (searchExpression) => searchEntityMeta(config, searchExpression),
    (meta) => buildEntityPickItem(meta, config.entityName),
    options,
  );
}

/**
 * Opens a QuickPick that live-searches projects and resolves to the picked
 * {@link ProjectMeta} (or `undefined` when the picker is dismissed).
 */
export function showProjectMetaPick(
  config: Config,
  options: Pick<vscode.QuickPickOptions, "placeHolder" | "ignoreFocusOut">,
): Promise<ProjectMeta | undefined> {
  return showMetaQuickPick<ProjectMeta>(
    (searchExpression) => searchProjectMeta(config, searchExpression),
    (meta) => buildProjectPickItem(meta),
    options,
  );
}

/**
 * Shared QuickPick harness used by the entity/project pickers. It debounces
 * the search box, discards stale results, and keeps the picker open when a
 * search fails (surfacing the error as a toast) instead of rejecting.
 */
function showMetaQuickPick<TMeta>(
  performSearch: (searchExpression: string) => Promise<TMeta[]>,
  buildItem: (meta: TMeta) => MetaPickItem<TMeta> | undefined,
  options: Pick<vscode.QuickPickOptions, "placeHolder" | "ignoreFocusOut">,
): Promise<TMeta | undefined> {
  const DEBOUNCE_DELAY_MS = 300;

  return new Promise<TMeta | undefined>((resolve) => {
    const quickPick = vscode.window.createQuickPick<MetaPickItem<TMeta>>();
    let debounceTimer: NodeJS.Timeout | undefined;
    let latestSearchId = 0;
    let settled = false;
    let lastErrorShown: string | undefined;

    function settle(result: TMeta | undefined): void {
      if (settled) {
        return;
      }
      settled = true;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      quickPick.dispose();
      resolve(result);
    }

    async function search(searchExpression: string): Promise<void> {
      const searchId = ++latestSearchId;
      quickPick.busy = true;

      try {
        const metas = await performSearch(searchExpression);
        if (settled || searchId !== latestSearchId) {
          return;
        }
        lastErrorShown = undefined;
        quickPick.items = metas.flatMap((meta) => {
          const item = buildItem(meta);
          return item ? [item] : [];
        });
      } catch (error) {
        if (settled || searchId !== latestSearchId) {
          return;
        }
        // A failed search keeps the picker open: clear results and surface the
        // error as a transient toast (deduped per failure streak) instead of
        // rejecting the pick promise silently.
        quickPick.items = [];
        const message =
          error instanceof Error
            ? error.message
            : `Search failed: ${String(error)}`;
        if (message !== lastErrorShown) {
          lastErrorShown = message;
          void vscode.window.showErrorMessage(message);
        }
      } finally {
        if (!settled && searchId === latestSearchId) {
          quickPick.busy = false;
        }
      }
    }

    quickPick.onDidChangeValue((e) => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        void search(e + "*");
      }, DEBOUNCE_DELAY_MS);
    });

    quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      if (selected) {
        settle(selected);
      }
    });

    quickPick.onDidHide(() => {
      settle(undefined);
    });

    if (options.placeHolder) {
      quickPick.placeholder = options.placeHolder;
    }

    if (options.ignoreFocusOut) {
      quickPick.ignoreFocusOut = options.ignoreFocusOut;
    }

    void search("*");
    quickPick.show();
  });
}

/** Downloads and parses a single entity from ThingWorx. */
export async function fetchEntity(
  config: Config,
  entityMeta: EntityMeta,
): Promise<Entity> {
  const source = await thingworxFetch(config, {
    method: "GET",
    endpoint: `/Thingworx/${entityMeta.parentType}/${entityMeta.name}`,
  });

  return new entityMap[entityMeta.type](entityMeta, source);
}

/** Downloads every entity in the given project (or nothing when omitted). */
export async function fetchProjectEntity(
  config: Config,
  projectMeta?: ProjectMeta,
): Promise<Entity[] | undefined> {
  if (!projectMeta) {
    return;
  }

  const entityMeta = await searchEntityMeta(config, "*", projectMeta);
  const entities = entityMeta.map((entity) => fetchEntity(config, entity));

  return Promise.all(entities);
}

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
  const results = await Promise.allSettled(
    services.map(async (service) => {
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

  return results.filter((result) => result.status === "fulfilled").length;
}

/**
 * Writes the given services to disk under `<root>/<project>/<entity>/`.
 * Returns how many of the writes succeeded.
 */
export async function writeServices(
  rootUri: vscode.Uri,
  entityMeta: EntityMeta,
  services: Service[],
): Promise<number> {
  const results = await Promise.allSettled(
    services.map((service) => writeEntityService(rootUri, entityMeta, service)),
  );
  const numFulfilled = results.filter(
    (result) => result.status === "fulfilled",
  ).length;

  return numFulfilled;
}

/** Writes a single service to disk under `<root>/<project>/<entity>/`. */
export async function writeEntityService(
  rootUri: vscode.Uri,
  entityMeta: EntityMeta,
  service: Service,
): Promise<void> {
  const uri = vscode.Uri.joinPath(
    rootUri,
    ...buildArtifactRelativePath(
      entityMeta,
      "service",
      service.name,
      service.extension,
    ),
  );
  const content = new TextEncoder().encode(service.source);
  await vscode.workspace.fs.writeFile(uri, content);
}

/** Writes all services of an entity to disk; returns the number written. */
export async function writeEntityServices(
  rootUri: vscode.Uri,
  entity: Entity,
): Promise<number> {
  return writeServices(rootUri, entity.meta, entity.getServices());
}

/**
 * Writes the given subscriptions to disk under `<root>/<project>/<entity>/subscriptions/`.
 * Returns how many writes succeeded.
 */
export async function writeSubscriptions(
  rootUri: vscode.Uri,
  entityMeta: EntityMeta,
  subscriptions: Subscription[],
): Promise<number> {
  const results = await Promise.allSettled(
    subscriptions.map((subscription) =>
      writeEntitySubscription(rootUri, entityMeta, subscription),
    ),
  );
  const numFulfilled = results.filter(
    (result) => result.status === "fulfilled",
  ).length;

  void warnCaseCollisions(
    rootUri,
    entityMeta,
    "subscription",
    subscriptions.map((subscription) => ({
      ...subscription,
      label: "subscription",
    })),
  );
  return numFulfilled;
}

/** Writes all subscriptions of an entity to disk; returns the number written. */
export async function writeEntitySubscriptions(
  rootUri: vscode.Uri,
  entity: Entity,
): Promise<number> {
  return writeSubscriptions(rootUri, entity.meta, entity.getSubscriptions());
}

/** Writes a single subscription to disk under `<root>/<project>/<entity>/subscriptions/`. */
export async function writeEntitySubscription(
  rootUri: vscode.Uri,
  entityMeta: EntityMeta,
  subscription: Subscription,
): Promise<void> {
  const uri = vscode.Uri.joinPath(
    rootUri,
    ...buildArtifactRelativePath(
      entityMeta,
      "subscription",
      subscription.name,
      subscription.extension,
    ),
  );
  const content = new TextEncoder().encode(subscription.source);
  await vscode.workspace.fs.writeFile(uri, content);
}

/**
 * Reads all service files (`.js`/`.sql`) that exist on disk for an entity,
 * skipping files that don't match the service schema.
 */
export async function readEntityServices(
  rootUri: vscode.Uri,
  entityMeta: EntityMeta,
): Promise<Service[]> {
  const folderUri = vscode.Uri.joinPath(
    rootUri,
    ...buildArtifactFolderRelativePath(entityMeta, "service"),
  );

  let files: [string, vscode.FileType][];

  try {
    files = await vscode.workspace.fs.readDirectory(folderUri);
  } catch (error) {
    if (error instanceof vscode.FileSystemError) {
      return [];
    }
    throw error;
  }

  const results = await Promise.allSettled(
    files
      .filter(([, filetype]) => filetype === vscode.FileType.File)
      .map(([filename]) => readEntityService(folderUri, filename)),
  );
  return results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
}

async function readEntityService(
  folderUri: vscode.Uri,
  filename: string,
): Promise<Service> {
  const uri = vscode.Uri.joinPath(folderUri, filename);
  const extension = path.extname(filename);
  const name = path.basename(filename, extension);
  const content = await vscode.workspace.fs.readFile(uri);
  const service = localServiceSchema.parse({
    name,
    extension,
    source: new TextDecoder().decode(content),
  });
  return service;
}

/**
 * Reads all subscription files (`.js`) that exist on disk for an entity,
 * skipping files that don't match the subscription schema. Returns an empty
 * array if the entity has no subscriptions/ folder at all.
 */
export async function readEntitySubscriptions(
  rootUri: vscode.Uri,
  entityMeta: EntityMeta,
): Promise<Subscription[]> {
  const folderUri = vscode.Uri.joinPath(
    rootUri,
    ...buildArtifactFolderRelativePath(entityMeta, "subscription"),
  );

  let files: [string, vscode.FileType][];

  try {
    files = await vscode.workspace.fs.readDirectory(folderUri);
  } catch (error) {
    if (error instanceof vscode.FileSystemError) {
      return [];
    }
    throw error;
  }

  const results = await Promise.allSettled(
    files
      .filter(([, filetype]) => filetype === vscode.FileType.File)
      .map(([filename]) => readEntitySubscription(folderUri, filename)),
  );
  return results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
}

async function readEntitySubscription(
  folderUri: vscode.Uri,
  filename: string,
): Promise<Subscription> {
  const uri = vscode.Uri.joinPath(folderUri, filename);
  const extension = path.extname(filename);
  const name = path.basename(filename, extension);
  const content = await vscode.workspace.fs.readFile(uri);
  return localSubscriptionSchema.parse({
    name,
    extension,
    source: new TextDecoder().decode(content),
  });
}

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

/** Pushes a whole entity definition back to ThingWorx with an optional comment. */
export async function updateEntity(
  config: Config,
  entity: Entity,
  comment: string,
): Promise<void> {
  let endpoint = `/Thingworx/${entity.meta.parentType}/${entity.meta.name}`;

  if (comment) {
    endpoint += `?reason=${comment}`;
  }

  await thingworxFetch(config, {
    method: "PUT",
    endpoint,
    body: entity.getSource(),
  });
}

export async function createNewService(): Promise<void> {}

/**
 * Searches ThingWorx (SpotlightSearchV2) for entities matching the expression,
 * optionally constrained to a single project.
 */
export async function searchEntityMeta(
  config: Config,
  searchExpression: string,
  projectMeta?: ProjectMeta,
): Promise<EntityMeta[]> {
  const MAX_ITEMS = 200;
  const MAX_SEARCH_ITEMS = 100_000;

  const result = await thingworxFetch(config, {
    method: "POST",
    endpoint: "/Thingworx/Resources/SearchFunctions/Services/SpotlightSearchV2",
    body: {
      aspects: {
        isEditableExtensionObject: false,
        isEditableSystemObject: false,
        isExtension: false,
        isSystemObject: false,
      },
      isAscending: true,
      maxItems: MAX_ITEMS,
      maxSearchItems: MAX_SEARCH_ITEMS,
      searchDescriptions: false,
      searchExpression: searchExpression,
      sortBy: "name",
      tags: [],
      types: {
        items: entityMetaSchema.shape.type.options,
      },
      withPermissions: false,
      projectName: projectMeta?.name,
    },
  });

  const parsed = z
    .object({
      rows: entityMetaSchema.array(),
    })
    .parse(result);
  return parsed.rows;
}

/** Searches ThingWorx (SpotlightSearchV2) for projects matching the expression. */
export async function searchProjectMeta(
  config: Config,
  searchExpression: string,
): Promise<ProjectMeta[]> {
  const MAX_ITEMS = 200;
  const MAX_SEARCH_ITEMS = 100_000;

  const result = await thingworxFetch(config, {
    method: "POST",
    endpoint: "/Thingworx/Resources/SearchFunctions/Services/SpotlightSearchV2",
    body: {
      aspects: {
        isEditableExtensionObject: false,
        isEditableSystemObject: false,
        isExtension: false,
        isSystemObject: false,
      },
      isAscending: true,
      maxItems: MAX_ITEMS,
      maxSearchItems: MAX_SEARCH_ITEMS,
      searchDescriptions: false,
      searchExpression: searchExpression,
      sortBy: "name",
      tags: [],
      types: {
        items: projectMetaSchema.shape.type.options,
      },
      withPermissions: false,
    },
  });

  const parsed = z
    .object({
      rows: projectMetaSchema.array(),
    })
    .parse(result);
  return parsed.rows;
}

/**
 * HTTP wrapper for the ThingWorx REST API. Attaches the application key,
 * serializes request bodies as JSON, and maps network failures / non-OK
 * responses to readable errors. Returns parsed JSON, plain text for HTML
 * responses, or `undefined` for empty bodies.
 */
async function thingworxFetch(
  config: Config,
  options: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    endpoint: string;
    headers?: Record<string, string | readonly string[]>;
    body?: unknown;
  },
): Promise<unknown> {
  const url = new URL(options.endpoint, config.baseUrl);

  const headers: typeof options.headers = {
    appKey: config.appKey,
    Accept: "application/json",
    "x-thingworx-session": "false",
    ...options.headers,
  };

  if (options.method === "POST" || options.method === "PUT") {
    headers["Content-Type"] = "application/json";
  }

  let body: string | undefined;

  if (options.body) {
    body = JSON.stringify(options.body);
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method: options.method,
      headers,
      body,
    });
  } catch (error) {
    throw new Error(
      `ThingWorx network error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    const text = await response.text();
    let message = `ThingWorx request failed (${response.status} ${http.STATUS_CODES[response.status]})`;

    if (text) {
      message += `: ${text}`;
    }

    throw new Error(message);
  }

  const contentType = response.headers.get("Content-Type");

  if (contentType?.includes("application/json")) {
    return await response.json();
  } else if (contentType?.includes("text/html")) {
    return await response.text();
  }

  return;
}

/**
 * Merged case-collision check across a service's code file and its `.yaml`
 * definition sidecar. Call this once both have been written for an entity.
 */
export async function warnEntityServiceCaseCollisions(
  rootUri: vscode.Uri,
  entity: Entity,
): Promise<void> {
  const services = entity.getServices();

  const codeArtifacts = services.map((service) => ({
    name: service.name,
    extension: service.extension,
    source: service.source,
    label: "code file",
  }));

  const definitionArtifacts = services.flatMap((service) => {
    const definition = entity.getServiceDefinition(service.name);

    if (!definition) {
      return [];
    }

    const source =
      buildDefinitionHeaderComment() +
      yaml.dump(
        collapseServiceDefinition(
          definition,
          entity.getServiceQueryConfig(service.name),
        ),
      );

    return [
      {
        name: service.name,
        extension: DEFINITION_EXTENSION,
        source,
        label: "definition",
      },
    ];
  });

  await warnCaseCollisions(rootUri, entity.meta, "service", [
    ...codeArtifacts,
    ...definitionArtifacts,
  ]);
}
