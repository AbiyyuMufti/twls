import path from "node:path";
import * as vscode from "vscode";
import { Base } from "./base";
import {
  buildArtifactRelativePath,
  buildEntityArtifactRelativePaths,
} from "../../core/utilities/artifact-path";
import { Config } from "../../config";
import { Entity } from "../../core/entity/entity";
import {
  buildServiceDefinitionYaml,
  DEFINITION_EXTENSION,
} from "../service-definitions/templates";

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

    const definitionPaths = newEntity
      .getServices()
      .filter((service) => newEntity.getServiceDefinition(service.name))
      .map((service) =>
        buildArtifactRelativePath(
          newEntity.meta,
          "service",
          service.name,
          DEFINITION_EXTENSION,
        ),
      );

    for (const segments of [
      ...buildEntityArtifactRelativePaths(newEntity),
      ...definitionPaths,
    ]) {
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

    return resolveRemoteArtifactContent(entity, artifactType, artifactFilename);
  }
}

/**
 * Resolves the text served for a `twls-remote://` artifact document. Unknown
 * artifacts get a readable message rather than an error, since VS Code shows
 * whatever is returned in the diff editor.
 */
export function resolveRemoteArtifactContent(
  entity: Entity,
  artifactType: string,
  artifactFilename: string,
): string {
  const extension = path.extname(artifactFilename);
  const name = path.basename(artifactFilename, extension);

  if (artifactType === "services") {
    if (extension === DEFINITION_EXTENSION) {
      const definition = entity.getServiceDefinition(name);

      if (!definition) {
        return `Service definition not found: ${name}`;
      }

      return buildServiceDefinitionYaml(
        definition,
        entity.getServiceQueryConfig(name),
      );
    }

    const service = entity
      .getServices()
      .find((s) => s.name === name && s.extension === extension);

    return service ? service.source : `Service not found: ${name}`;
  }

  if (artifactType === "subscriptions") {
    const subscription = entity
      .getSubscriptions()
      .find((s) => s.name === name && s.extension === extension);

    return subscription
      ? subscription.source
      : `Subscription not found: ${name}`;
  }

  return `Unsupported artifact type: ${artifactType}`;
}
