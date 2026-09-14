import path from "node:path";
import * as vscode from "vscode";
import { Base } from "./base";
import { Config } from "./config";
import { Entity } from "./thingworx";

export const REMOTE_SCHEME = "twls-remote";

/**
 * Serves the "original" (remote ThingWorx) side of service-file diffs as
 * virtual read-only documents under the `twls-remote://` scheme. When a local
 * service file is compared, VS Code asks this provider for its remote
 * counterpart instead of a filesystem copy.
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
   * service documents has changed so open diffs refresh.
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

    newEntity.getServices().forEach((service) => {
      const serviceUri = vscode.Uri.joinPath(
        entityUri,
        service.name + service.extension,
      );
      this._onDidChange.fire(serviceUri);
    });
  }

  /**
   * Resolves the requested virtual service document by looking up its entity
   * snapshot and returning the matching service's source code. Malformed URIs,
   * unknown entities, and unknown services each get a readable error message.
   */
  async provideTextDocumentContent(
    uri: vscode.Uri,
    token: vscode.CancellationToken,
  ): Promise<string | undefined> {
    if (token.isCancellationRequested) {
      return;
    }

    const [, projectName, entityName, artifactFilename] = uri.path.split("/");

    if (!projectName || !entityName || !artifactFilename) {
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

    const serviceExtension = path.extname(artifactFilename);
    const serviceName = path.basename(artifactFilename, serviceExtension);
    const service = entity
      .getServices()
      .find(
        (service) =>
          service.name === serviceName &&
          service.extension === serviceExtension,
      );

    if (!service) {
      return `Service not found: ${serviceName}`;
    }

    return service.source;
  }
}
