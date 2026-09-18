import path from "node:path";
import * as vscode from "vscode";
import { Base } from "./base";
import { buildEntityArtifactRelativePaths } from "./utilities/artifact-path";
import { Config } from "./config";
import { Entity } from "./entity/entity";

export const REMOTE_SCHEME = "twls-remote";

/**
 * Serves the "original" remote ThingWorx artifacts for diffs as virtual
 * read-only documents under the `twls-remote://` scheme. The provider
 * supports both service and subscription files.
 */
export class RemoteTextDocumentContentProvider
  implements vscode.TextDocumentContentProvider, vscode.Disposable
{
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  get onDidChange(): vscode.Event<vscode.Uri> {
    return this._onDidChange.event;
  }

  private entities: Base;

  constructor(rootUri: vscode.Uri) {
    this.entities = new Base(rootUri);
  }

  dispose(): void {
    this._onDidChange.dispose();
    this.entities.clear().catch((error) => {
      console.error(error);
    });
  }

  /**
   * Persists a fresh entity snapshot and notifies VS Code that every one of its
   * service and subscription documents has changed so open diffs refresh.
   */
  updated(config: Config, newEntity: Entity): void {
    const entityUri = vscode.Uri.parse(
      `${REMOTE_SCHEME}://${config.host}/${newEntity.meta.projectName}/${newEntity.meta.name}?type=${newEntity.meta.type}&parentType=${newEntity.meta.parentType}`,
      true,
    );
    const key = entityUri.toString();
    void this.entities.set(key, newEntity).catch((error) => {
      console.error(error);
    });

    for (const segments of buildEntityArtifactRelativePaths(newEntity)) {
      this._onDidChange.fire(
        entityUri.with({ path: `/${segments.join("/")}` }),
      );
    }
  }

  /**
   * Resolves a requested virtual service or subscription document from its
   * cached entity snapshot. Malformed URIs, unknown entities, unknown artifacts,
   * and unsupported artifact types each get a readable error message.
   */
  async provideTextDocumentContent(
    uri: vscode.Uri,
    token: vscode.CancellationToken,
  ): Promise<string | undefined> {
    if (token.isCancellationRequested) {
      return;
    }

    const [, projectName, entityName, artifactType, artifactFilename] =
      uri.path.split("/");

    if (!projectName || !entityName || !artifactType || !artifactFilename) {
      return `Malformed URI: ${uri.toString()}`;
    }

    const entityUri = uri.with({
      authority: uri.authority,
      path: `/${projectName}/${entityName}`,
      query: uri.query,
    });

    const entity = await this.entities.get(entityUri.toString());

    if (!entity) {
      return `Entity not found: ${entityName}`;
    }

    const artifactExtension = path.extname(artifactFilename);
    const artifactName = path.basename(artifactFilename, artifactExtension);

    if (artifactType === "services") {
      const service = entity
        .getServices()
        .find(
          (service) =>
            service.name === artifactName &&
            service.extension === artifactExtension,
        );

      if (!service) {
        return `Service not found: ${artifactName}`;
      }

      return service.source;
    }

    if (artifactType === "subscriptions") {
      const subscription = entity
        .getSubscriptions()
        .find(
          (subscription) =>
            subscription.name === artifactName &&
            subscription.extension === artifactExtension,
        );

      if (!subscription) {
        return `Subscription not found: ${artifactName}`;
      }

      return subscription.source;
    }

    return `Unsupported artifact type: ${artifactType}`;
  }
}
