import http from "node:http";
import path from "node:path";
import * as vscode from "vscode";
import z from "zod";
import { Config } from "./config";
import { ThingShape } from "./entity/thing-shape";
import { ThingTemplate } from "./entity/thing-template";

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

export const entityMetaSchema = z.object({
  name: z.string(),
  projectName: z.string(),
  type: z.enum(entityTypes),
  parentType: z.enum(parentTypes),
});

export type EntityMeta = z.infer<typeof entityMetaSchema>;

const serviceSchema = z.object({
  name: z.string(),
  source: z.string(),
  extension: z.enum([".js", ".sql"]),
});

export type Service = z.infer<typeof serviceSchema>;

export function getServiceExtensionPattern(): string {
  const s = serviceSchema.shape.extension.options
    .map((ext) => ext.slice(1))
    .join(",");
  return `**/*.{${s}}`;
}

export interface Entity {
  meta: EntityMeta;
  getSource(): unknown;
  getLastModifiedDate(): number;
  getServices(): Service[];
  updateService(name: string, source: string): void;
  setLastModifiedDate(value: number): void;
}

export const entityMap = {
  ThingShape: ThingShape,
  ThingTemplate: ThingTemplate,
} satisfies Record<
  EntityMeta["type"],
  new (meta: EntityMeta, source: unknown) => Entity
>;

export function showEntityMetaPick(
  config: Config,
  options: Pick<vscode.QuickPickOptions, "placeHolder" | "ignoreFocusOut">,
): Promise<EntityMeta | undefined> {
  const DEBOUNCE_DELAY_MS = 300;

  type EntityMetaQuickPickItem = EntityMeta & {
    label: string;
    description: string;
    detail: string;
  };

  return new Promise((resolve, reject) => {
    const quickPick = vscode.window.createQuickPick<EntityMetaQuickPickItem>();
    let timer: NodeJS.Timeout | undefined;

    async function search(searchExpression: string): Promise<void> {
      quickPick.busy = true;

      try {
        const metas = await searchEntityMeta(config, searchExpression);
        const items = metas
          .filter((meta) => meta.name !== config.entityName)
          .map(
            (meta) =>
              ({
                ...meta,
                label: meta.name,
                description: meta.type,
                detail: meta.projectName,
              }) satisfies EntityMetaQuickPickItem,
          );
        quickPick.items = items;
      } catch (error) {
        if (error instanceof Error) {
          reject(error);
        }
      } finally {
        quickPick.busy = false;
      }
    }

    if (options.placeHolder) {
      quickPick.placeholder = options.placeHolder;
    }

    if (options.ignoreFocusOut) {
      quickPick.ignoreFocusOut = options.ignoreFocusOut;
    }

    quickPick.onDidChangeValue((e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void search(e + "*");
      }, DEBOUNCE_DELAY_MS);
    });

    quickPick.onDidAccept(() => {
      resolve(quickPick.selectedItems[0]);
      quickPick.hide();
    });

    quickPick.onDidHide(() => {
      resolve(undefined);
      quickPick.dispose();
    });

    void search("*");
    quickPick.show();
  });
}

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

export async function writeEntityServices(
  rootUri: vscode.Uri,
  entity: Entity,
): Promise<number> {
  return writeServices(rootUri, entity.meta, entity.getServices());
}

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

export async function updateEntity(
  config: Config,
  entity: Entity,
): Promise<void> {
  await thingworxFetch(config, {
    method: "PUT",
    endpoint: `/Thingworx/${entity.meta.parentType}/${entity.meta.name}`,
    body: entity.getSource(),
  });
}

export async function searchEntityMeta(
  config: Config,
  searchExpression: string,
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
    },
  });

  const parsed = z
    .object({
      rows: entityMetaSchema.array(),
    })
    .parse(result);
  return parsed.rows;
}

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
