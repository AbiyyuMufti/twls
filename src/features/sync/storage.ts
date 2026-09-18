import path from "node:path";
import * as vscode from "vscode";
import {
  Entity,
  EntityMeta,
  Service,
  localServiceSchema,
  Subscription,
  localSubscriptionSchema,
} from "../../entity/entity";
import {
  buildArtifactFolderRelativePath,
  buildArtifactRelativePath,
} from "../../utilities/artifact-path";
import { warnDroppedCaseCollisions } from "../../warn-case-collision";
import { dedupeByPreferredCase } from "../../utilities/case-collision";
export async function writeServices(
  rootUri: vscode.Uri,
  entityMeta: EntityMeta,
  services: Service[],
): Promise<number> {
  const { kept, dropped } = dedupeByPreferredCase(services);

  const results = await Promise.allSettled(
    kept.map((service) => writeEntityService(rootUri, entityMeta, service)),
  );
  const numFulfilled = results.filter(
    (result) => result.status === "fulfilled",
  ).length;

  warnDroppedCaseCollisions(
    entityMeta,
    dropped.map((service) => ({ name: service.name, label: "code file" })),
  );

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
  const { kept, dropped } = dedupeByPreferredCase(subscriptions);

  const results = await Promise.allSettled(
    kept.map((subscription) =>
      writeEntitySubscription(rootUri, entityMeta, subscription),
    ),
  );
  const numFulfilled = results.filter(
    (result) => result.status === "fulfilled",
  ).length;

  warnDroppedCaseCollisions(
    entityMeta,
    dropped.map((subscription) => ({
      name: subscription.name,
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
