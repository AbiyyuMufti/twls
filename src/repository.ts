import path from "node:path";
import * as vscode from "vscode";
import { Config } from "./config";
import { REMOTE_SCHEME } from "./remote";
import {
  Entity,
  fetchEntity,
  getServiceExtensionPattern,
  readEntityServices,
  searchEntityMeta,
  Service,
  showEntityMetaPick,
  updateEntity,
  writeEntityServices,
} from "./thingworx";

export class Repository implements vscode.QuickDiffProvider, vscode.Disposable {
  private sourceControl: vscode.SourceControl;
  private workingTreeGroup: vscode.SourceControlResourceGroup;
  private fileSystemWatcher: vscode.FileSystemWatcher;

  private _entity!: Entity;
  get entity(): Entity {
    return this._entity;
  }

  private _onEntityChange = new vscode.EventEmitter<Entity>();
  get onEntityChange(): vscode.Event<Entity> {
    return this._onEntityChange.event;
  }

  constructor(
    private rootUri: vscode.Uri,
    private config: Config,
    entity: Entity,
  ) {
    this.sourceControl = vscode.scm.createSourceControl(
      "twls",
      "TWLS",
      rootUri,
    );
    this.workingTreeGroup = this.sourceControl.createResourceGroup(
      "workingTree",
      "Changes",
    );

    this.fileSystemWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(rootUri, getServiceExtensionPattern()),
    );
    this.fileSystemWatcher.onDidCreate(() => {
      this.updateWorkingTreeGroup().catch((error) => {
        console.error(error);
      });
    });
    this.fileSystemWatcher.onDidChange(() => {
      this.updateWorkingTreeGroup().catch((error) => {
        console.error(error);
      });
    });
    this.fileSystemWatcher.onDidDelete(() => {
      this.updateWorkingTreeGroup().catch((error) => {
        console.error(error);
      });
    });

    this.setEntity(entity);
    this.updateWorkingTreeGroup().catch((error) => {
      console.error(error);
    });
  }

  provideOriginalResource(
    uri: vscode.Uri,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.Uri> {
    if (token.isCancellationRequested) {
      return;
    }

    const relativePath = vscode.workspace.asRelativePath(uri, false);
    return vscode.Uri.from({
      scheme: REMOTE_SCHEME,
      authority: this.config.host,
      path: "/" + relativePath,
    });
  }

  dispose(): void {
    this.sourceControl.dispose();
    this.fileSystemWatcher.dispose();
  }

  static async init(
    rootUri: vscode.Uri,
    config: Config,
  ): Promise<Repository | undefined> {
    const entityMetas = await searchEntityMeta(config, config.entityName);
    const entityMeta = entityMetas[0];

    if (!entityMeta) {
      return;
    }

    const entity = await fetchEntity(config, entityMeta);
    return new Repository(rootUri, config, entity);
  }

  async pull(): Promise<[string, number]> {
    const entityMeta = await showEntityMetaPick(this.config, {
      placeHolder: "Pick entity",
      ignoreFocusOut: true,
    });

    if (!entityMeta) {
      return ["", 0];
    }

    const entity = await fetchEntity(this.config, entityMeta);
    const numServicesPulled = await writeEntityServices(this.rootUri, entity);
    return [entityMeta.name, numServicesPulled];
  }

  async push(): Promise<[string, number]> {
    const entityMeta = await showEntityMetaPick(this.config, {
      placeHolder: "Pick entity",
      ignoreFocusOut: true,
    });

    if (!entityMeta) {
      return ["", 0];
    }

    const entity = await fetchEntity(this.config, entityMeta);
    const localServices = await readEntityServices(this.rootUri, entityMeta);

    for (const service of localServices) {
      entity.updateService(service.name, service.source);
    }

    await updateEntity(this.config, entity);
    return [entityMeta.name, localServices.length];
  }

  private setEntity(entity: Entity): void {
    this._entity = entity;
    this._onEntityChange.fire(entity);
  }

  private async updateWorkingTreeGroup(): Promise<void> {
    const workingTreeResources: vscode.SourceControlResourceState[] = [];
    const entries = this._entity
      .getServices()
      .map((service) => [service, this.getLocalUri(service)] as const);

    for (const [service, localUri] of entries) {
      let isDirty: boolean;
      let wasDeleted: boolean;

      try {
        await vscode.workspace.fs.stat(localUri);
        const document = await vscode.workspace.openTextDocument(localUri);
        isDirty =
          service.source.replace("\r", "") !==
          document.getText().replace("\r", "");
        wasDeleted = false;
      } catch (error) {
        if (error instanceof vscode.FileSystemError) {
          isDirty = true;
          wasDeleted = true;
        } else {
          throw error;
        }
      }

      if (isDirty) {
        const resourceState = this.toSourceControlResourceState(
          localUri,
          wasDeleted,
        );
        workingTreeResources.push(resourceState);
      }
    }

    this.workingTreeGroup.resourceStates = workingTreeResources;
    this.sourceControl.count = this.workingTreeGroup.resourceStates.length;
  }

  private toSourceControlResourceState(
    localUri: vscode.Uri,
    deleted: boolean,
  ): vscode.SourceControlResourceState {
    const cts = new vscode.CancellationTokenSource();
    const remoteUri = this.provideOriginalResource(localUri, cts.token);
    cts.dispose();

    let title = path.basename(localUri.fsPath);
    let command: vscode.Command;
    let decorations: vscode.SourceControlResourceDecorations;

    if (deleted) {
      title += " (Deleted)";
      command = {
        title,
        command: "vscode.open",
        arguments: [remoteUri, { preview: true }, title],
      };
      decorations = {
        iconPath: new vscode.ThemeIcon("diff-removed"),
        tooltip: title,
      };
    } else {
      title += " (Modified)";
      command = {
        title,
        command: "vscode.diff",
        arguments: [remoteUri, localUri, title],
      };
      decorations = {
        iconPath: new vscode.ThemeIcon("diff-single"),
        tooltip: title,
      };
    }

    return {
      resourceUri: localUri,
      command,
      decorations,
    };
  }

  private getLocalUri(service: Service): vscode.Uri {
    return vscode.Uri.joinPath(
      this.rootUri,
      this._entity.meta.projectName,
      this._entity.meta.name,
      service.name + service.extension,
    );
  }
}
