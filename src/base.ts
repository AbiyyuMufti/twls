import * as vscode from "vscode";
import {
  Entity,
  entityMap,
  EntityMeta,
  entityMetaSchema,
} from "./core/entity/entity";

/**
 * On-disk snapshot store for remote entities.
 *
 * Remote entity JSON is cached under `base/<host>/<project>/<entity>.json`
 * (relative to the passed root URI) so virtual `twls-remote://` documents can
 * keep serving content across sessions. Keys are URIs of the form
 * `twls-remote://host/project/entity?type=...&parentType=...`.
 */
export class Base {
  private static FOLDER_NAME = "base";

  constructor(private rootUri: vscode.Uri) {}

  get size(): number {
    throw new Error("Method not implemented.");
  }

  /** Reads the cached entity for the given key URI. */
  async get(key: string): Promise<Entity | undefined> {
    const [sourceUri, entityMeta] = this.parseKey(key);
    const content = await vscode.workspace.fs.readFile(sourceUri);
    const source = JSON.parse(new TextDecoder().decode(content)) as unknown;
    return new entityMap[entityMeta.type](entityMeta, source);
  }

  /** Writes the entity's source JSON to the cache location for the key URI. */
  async set(key: string, entity: Entity): Promise<this> {
    const [sourceUri] = this.parseKey(key);
    const content = new TextEncoder().encode(
      JSON.stringify(entity.getSource()),
    );
    await vscode.workspace.fs.writeFile(sourceUri, content);
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  has(_key: string): boolean {
    throw new Error("Method not implemented.");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  delete(_key: string): boolean {
    throw new Error("Method not implemented.");
  }

  async clear(): Promise<void> {
    await vscode.workspace.fs.delete(
      vscode.Uri.joinPath(this.rootUri, Base.FOLDER_NAME),
      { recursive: true },
    );
  }

  /**
   * Reverses a key URI into the cache file path plus the decoded entity meta.
   * The host is encoded as a path segment, and `type`/`parentType` come from
   * the URI query string.
   */
  private parseKey(key: string): [vscode.Uri, EntityMeta] {
    const uri = vscode.Uri.parse(key, true);
    const [, projectName, entityName] = uri.path.split("/");

    if (!projectName || !entityName) {
      throw new Error(`Invalid key: ${key}`);
    }

    const sourceUri = vscode.Uri.joinPath(
      this.rootUri,
      Base.FOLDER_NAME,
      encodeURIComponent(uri.authority),
      projectName,
      entityName + ".json",
    );

    const query = new URLSearchParams(uri.query);

    const type = query.get("type");

    if (!type) {
      throw new Error(`Invalid key: ${key}`);
    }

    const parentType = query.get("parentType");

    if (!parentType) {
      throw new Error(`Invalid key: ${key}`);
    }

    const entityMeta = entityMetaSchema.parse({
      name: entityName,
      projectName,
      type,
      parentType,
    });

    return [sourceUri, entityMeta];
  }
}
