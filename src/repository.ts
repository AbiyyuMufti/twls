import path from "node:path";
import * as vscode from "vscode";
import { Config } from "./config";
import { REMOTE_SCHEME } from "./remote";
import {
  Entity,
  EntityMeta,
  fetchEntity,
  getServiceExtensionPattern,
  readEntityServices,
  searchEntityMeta,
  Service,
  updateEntity,
  writeEntityService,
  writeEntityServices,
  writeServices,
} from "./thingworx";

type State = "dirty" | "deleted" | "synced";

export class Repository implements vscode.QuickDiffProvider, vscode.Disposable {
  private sourceControl: vscode.SourceControl;
  private workingTreeGroup: vscode.SourceControlResourceGroup;
  private fileSystemWatcher: vscode.FileSystemWatcher;
  private timer?: NodeJS.Timeout;

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
    public readonly config: Config,
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
      this.tryUpdateWorkingTreeGroup();
    });
    this.fileSystemWatcher.onDidChange(() => {
      this.tryUpdateWorkingTreeGroup();
    });
    this.fileSystemWatcher.onDidDelete(() => {
      this.tryUpdateWorkingTreeGroup();
    });

    this.setEntity(entity);
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
      query: `type=${this._entity.meta.type}&parentType=${this._entity.meta.parentType}`,
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
    const repo = new Repository(rootUri, config, entity);
    await repo.updateWorkingTreeGroup();
    await repo.writeNonDirtyServices();
    return repo;
  }

  async pull(): Promise<number> {
    if (this.workingTreeGroup.resourceStates.length > 0) {
      throw new Error("Please push/discard all the changes first before pull.");
    }

    const newEntity = await fetchEntity(this.config, this._entity.meta);

    if (
      newEntity.getLastModifiedDate() === this._entity.getLastModifiedDate()
    ) {
      return 0;
    }

    this.setEntity(newEntity);
    const numServicesPulled = await writeEntityServices(
      this.rootUri,
      newEntity,
    );
    return numServicesPulled;
  }

  async push(): Promise<number> {
    if (this.workingTreeGroup.resourceStates.length === 0) {
      throw new Error("No changes to push.");
    }

    const newEntity = await fetchEntity(this.config, this._entity.meta);

    if (newEntity.getLastModifiedDate() > this._entity.getLastModifiedDate()) {
      throw new Error(
        "ThingWorx changed since last pull. Please pull first to get the latest updates.",
      );
    }

    const localServices = await readEntityServices(
      this.rootUri,
      this._entity.meta,
    );

    for (const service of localServices) {
      this._entity.updateService(service.name, service.source);
    }

    this._entity.setLastModifiedDate(Date.now());

    await updateEntity(this.config, this._entity);
    await this.updateWorkingTreeGroup();

    return localServices.length;
  }

  async switchEntity(entityMeta: EntityMeta): Promise<void> {
    const entity = await fetchEntity(this.config, entityMeta);
    this.setEntity(entity);
    await this.updateWorkingTreeGroup();
    await this.writeNonDirtyServices();

    this.config.entityName = entityMeta.name;
    await this.config.save();
  }

  async discard(localUri: vscode.Uri): Promise<void> {
    const service = this.getServiceFromLocalUri(localUri);
    await writeEntityService(this.rootUri, this._entity.meta, service);
  }

  private setEntity(entity: Entity): void {
    this._entity = entity;
    this._onEntityChange.fire(entity);
    this.refreshStatusBar();
  }

  private async writeNonDirtyServices(): Promise<void> {
    const servicesToBeWritten = this._entity.getServices().filter((service) => {
      const localUri = this.getLocalUriFromService(service);
      const isDirty = this.workingTreeGroup.resourceStates.find(
        (resourceState) =>
          resourceState.resourceUri.toString() === localUri.toString() &&
          resourceState.contextValue === "dirty",
      );
      return !isDirty;
    });

    await writeServices(this.rootUri, this._entity.meta, servicesToBeWritten);
  }

  private tryUpdateWorkingTreeGroup(): void {
    const DEBOUNCE_DELAY_MS = 300;

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.updateWorkingTreeGroup().catch((error) => {
        console.error(error);
      });
    }, DEBOUNCE_DELAY_MS);
  }

  private async updateWorkingTreeGroup(): Promise<void> {
    const workingTreeResources: vscode.SourceControlResourceState[] = [];
    const entries = this._entity
      .getServices()
      .map(
        (service) => [service, this.getLocalUriFromService(service)] as const,
      );

    for (const [service, localUri] of entries) {
      let state: State = "synced";

      try {
        await vscode.workspace.fs.stat(localUri);
        const document = await vscode.workspace.openTextDocument(localUri);
        const isDirty =
          service.source.replace("\r", "") !==
          document.getText().replace("\r", "");

        if (isDirty) {
          state = "dirty";
        }
      } catch (error) {
        if (error instanceof vscode.FileSystemError) {
          state = "deleted";
        } else {
          throw error;
        }
      }

      if (state !== "synced") {
        const resourceState = this.toSourceControlResourceState(
          localUri,
          state,
        );
        workingTreeResources.push(resourceState);
      }
    }

    this.workingTreeGroup.resourceStates = workingTreeResources;
    this.sourceControl.count = this.workingTreeGroup.resourceStates.length;
  }

  private toSourceControlResourceState(
    localUri: vscode.Uri,
    state: State,
  ): vscode.SourceControlResourceState {
    const cts = new vscode.CancellationTokenSource();
    const remoteUri = this.provideOriginalResource(localUri, cts.token);
    cts.dispose();

    let title = path.basename(localUri.fsPath);
    let command: vscode.Command;
    let decorations: vscode.SourceControlResourceDecorations;

    switch (state) {
      case "deleted":
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
        break;

      case "dirty":
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
        break;

      case "synced":
        throw new Error(`Invalid state: ${state}`);
    }

    return {
      resourceUri: localUri,
      command,
      decorations,
      contextValue: state,
    };
  }

  private refreshStatusBar(): void {
    this.sourceControl.statusBarCommands = [
      {
        title: `$(arrow-swap) ${this._entity.meta.name}`,
        command: "twls.switchEntity",
        arguments: [this.rootUri],
        tooltip: "Switch Entity",
      },
    ];
  }

  private getLocalUriFromService(service: Service): vscode.Uri {
    return vscode.Uri.joinPath(
      this.rootUri,
      this._entity.meta.projectName,
      this._entity.meta.name,
      service.name + service.extension,
    );
  }

  private getServiceFromLocalUri(localUri: vscode.Uri): Service {
    const filename = path.basename(localUri.fsPath);
    const service = this._entity
      .getServices()
      .find((service) => service.name + service.extension === filename);

    if (!service) {
      throw new Error(
        `Service ${filename} does not exist on entity ${this._entity.meta.name}`,
      );
    }

    return service;
  }
}
