import path from "node:path";
import * as vscode from "vscode";
import { Config } from "./config";
import { Entity } from "./thingworx";

export const REMOTE_SCHEME = "twls-remote";

export class RemoteTextDocumentContentProvider
  implements vscode.TextDocumentContentProvider, vscode.Disposable
{
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  get onDidChange(): vscode.Event<vscode.Uri> {
    return this._onDidChange.event;
  }

  private entities = new Map<string, Entity>();

  dispose(): void {
    this._onDidChange.dispose();
    this.entities.clear();
  }

  updated(config: Config, newEntity: Entity): void {
    const entityUri = vscode.Uri.parse(
      `${REMOTE_SCHEME}://${config.host}/${newEntity.meta.projectName}/${newEntity.meta.name}`,
      true,
    );
    const key = entityUri.toString();
    this.entities.set(key, newEntity);

    newEntity.getServices().forEach((service) => {
      const serviceUri = vscode.Uri.joinPath(
        entityUri,
        service.name + service.extension,
      );
      this._onDidChange.fire(serviceUri);
    });
  }

  provideTextDocumentContent(
    uri: vscode.Uri,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<string> {
    if (token.isCancellationRequested) {
      return;
    }

    const [, projectName, entityName, filename] = uri.path.split("/");

    if (!projectName || !entityName || !filename) {
      return `Malformed URI: ${uri.toString()}`;
    }

    const entityUri = uri.with({
      authority: uri.authority,
      path: `/${projectName}/${entityName}`,
    });
    const entity = this.entities.get(entityUri.toString());

    if (!entity) {
      return `Entity not found: ${entityName}`;
    }

    const serviceExtension = path.extname(filename);
    const serviceName = path.basename(filename, serviceExtension);
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
