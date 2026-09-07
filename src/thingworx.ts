import http from "node:http";
import path from "node:path";
import * as vscode from "vscode";
import z from "zod";
import { Config } from "./config";
import { ThingShape } from "./entity/thing-shape";
import { ThingTemplate } from "./entity/thing-template";
import {
  buildEntityPickItem,
  buildProjectPickItem,
  type MetaPickItem,
} from "./pick-item";

/**
 * ThingWorx integration: schemas and helpers for identifying entities,
 * searching/pulling/pushing entity definitions, and reading service code out of
 * them. All communication goes through {@link thingworxFetch}, which speaks to
 * the ThingWorx REST API with the configured application key.
 */

/** Maps each entity type to the REST collection ("parent type") it lives under. */
const entityParentTypes = {
  ThingShape: "ThingShapes",
  ThingTemplate: "ThingTemplates",
} as const;

const entityTypes = Object.keys(entityParentTypes) as unknown as readonly [
  keyof typeof entityParentTypes,
];

const parentTypes = Object.values(entityParentTypes) as unknown as readonly [
  (typeof entityParentTypes)[keyof typeof entityParentTypes],
];

/**
 * Uniquely identifies a ThingWorx entity. `type` is the entity kind
 * (`ThingShape`/`ThingTemplate`) and `parentType` is the REST collection it is
 * stored under (`ThingShapes`/`ThingTemplates`).
 */
export const entityMetaSchema = z.object({
  name: z.string(),
  projectName: z.string(),
  type: z.enum(entityTypes),
  parentType: z.enum(parentTypes),
});

export type EntityMeta = z.infer<typeof entityMetaSchema>;

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

/** A single callable service: its name, source code, and file extension. */
const serviceSchema = z.object({
  name: z.string(),
  source: z.string(),
  extension: z.enum([".js", ".sql"]),
});

export type Service = z.infer<typeof serviceSchema>;

/** Glob for watching all service files (`.js` and `.sql`) under a root. */
export function getServiceExtensionPattern(): string {
  const s = serviceSchema.shape.extension.options
    .map((ext) => ext.slice(1))
    .join(",");
  return `**/*.{${s}}`;
}

/**
 * Uniform view over a fetched ThingWorx entity: its identity, the raw JSON it
 * was parsed from, and its services. `getSource()` returns the raw JSON so it
 * can be persisted or PUT back to the server.
 */
export interface Entity {
  meta: EntityMeta;
  getSource(): unknown;
  getLastModifiedDate(): number;
  getServices(): Service[];
  updateService(name: string, source: string): void;
}

/** Constructs the right entity class for each {@link EntityMeta.type}. */
export const entityMap = {
  ThingShape: ThingShape,
  ThingTemplate: ThingTemplate,
} satisfies Record<
  EntityMeta["type"],
  new (meta: EntityMeta, source: unknown) => Entity
>;

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
          error instanceof Error ? error.message : `Search failed: ${String(error)}`;
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

/** Writes all services of an entity to disk; returns the number written. */
export async function writeEntityServices(
  rootUri: vscode.Uri,
  entity: Entity,
): Promise<number> {
  return writeServices(rootUri, entity.meta, entity.getServices());
}

/** Writes a single service to disk under `<root>/<project>/<entity>/`. */
export async function writeEntityService(
  rootUri: vscode.Uri,
  entityMeta: EntityMeta,
  service: Service,
): Promise<void> {
  const uri = vscode.Uri.joinPath(
    rootUri,
    entityMeta.projectName,
    entityMeta.name,
    service.name + service.extension,
  );
  const content = new TextEncoder().encode(service.source);
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
    entityMeta.projectName,
    entityMeta.name,
  );
  const files = await vscode.workspace.fs.readDirectory(folderUri);
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
  const service = serviceSchema.parse({
    name,
    extension,
    source: new TextDecoder().decode(content),
  });
  return service;
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
