import path from "node:path";
import * as vscode from "vscode";
import { Config } from "./config";
import { REMOTE_SCHEME } from "./remote";
import { normalizeEol } from "./text";
import {
  Entity,
  EntityMeta,
  getServiceExtensionPattern,
  Service,
  Subscription,
} from "./entity/entity";

import {
  fetchEntity,
  fetchProjectEntity,
  ProjectMeta,
  readEntityServices,
  readEntitySubscriptions,
  searchEntityMeta,
  searchProjectMeta,
  updateEntity,
  writeEntityService,
  writeEntityServices,
  writeEntitySubscription,
  writeEntitySubscriptions,
  writeServices,
  writeSubscriptions,
} from "./thingworx";
import { ArtifactKind, buildArtifactRelativePath } from "./artifact-path";

/** Per-artifact sync status shown in the source-control "Changes" group. */
type State = "dirty" | "deleted" | "synced";

/** Number of services and subscriptions affected by a repository operation. */
export type EntityDataCount = {
  numServices: number;
  numSubscriptions: number;
};

/**
 * One TWLS "repository": a workspace folder working against a single active
 * ThingWorx entity. Exposes that entity's services and subscriptions through
 * VS Code source control — local edits show up as dirty/deleted changes
 * compared to the remote snapshot, and can be pushed, pulled, or discarded.
 */
export class Repository implements vscode.QuickDiffProvider, vscode.Disposable {
  private sourceControl: vscode.SourceControl;
  private workingTreeGroup: vscode.SourceControlResourceGroup;
  private fileSystemWatcher: vscode.FileSystemWatcher;
  private timer?: NodeJS.Timeout;

  private _entity!: Entity;

  /** Returns the repository's currently active ThingWorx entity snapshot. */
  get entity(): Entity {
    return this._entity;
  }

  private _onEntityChange = new vscode.EventEmitter<Entity>();

  /** Fires whenever the repository switches to a different entity definition. */
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
    this.sourceControl.inputBox.placeholder =
      "Optional comment (Ctrl+Enter to push)";
    this.sourceControl.inputBox.value = "";
    this.sourceControl.acceptInputCommand = {
      command: "twls.push",
      title: "Push",
      arguments: [this.sourceControl],
    };

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

  /**
   * Returns the virtual `twls-remote://` URI that represents the "original"
   * remote version of a local service or subscription file for diffing.
   */
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

  /** Releases the VS Code source-control and filesystem-watcher resources. */
  dispose(): void {
    this.sourceControl.dispose();
    this.fileSystemWatcher.dispose();
  }

  /**
   * Builds a repository for a folder: resolves the configured entity from its
   * project, fetches the project entities, and writes their non-dirty services
   * and subscriptions to disk so the folder starts in a consistent state.
   * Returns `undefined` if the configured entity can't be found.
   */
  static async init(
    rootUri: vscode.Uri,
    config: Config,
  ): Promise<Repository | undefined> {
    const entityMetas = await searchEntityMeta(config, config.entityName);
    const entityMeta = entityMetas[0];

    if (!entityMeta) {
      return;
    }

    const projectMeta = await searchProjectMeta(config, entityMeta.projectName);
    const entities = await fetchProjectEntity(config, projectMeta[0]);

    const entity = await fetchEntity(config, entityMeta);
    const repo = new Repository(rootUri, config, entity);

    await repo.updateWorkingTreeGroup();
    await repo.writeProjectNonDirtyServices(entities);
    await repo.writeProjectNonDirtySubscriptions(entities);
    return repo;
  }

  /**
   * Pulls the active entity's latest services and subscriptions from ThingWorx
   * and writes them to disk. No-op when the entity hasn't changed since the last
   * pull. Returns how many services and subscriptions were written; throws if
   * there are uncommitted local changes.
   */
  async pull(): Promise<EntityDataCount> {
    if (this.workingTreeGroup.resourceStates.length > 0) {
      throw new Error("Please push/discard all the changes first before pull.");
    }

    const newEntity = await fetchEntity(this.config, this._entity.meta);

    if (
      newEntity.getLastModifiedDate() === this._entity.getLastModifiedDate()
    ) {
      return {
        numServices: 0,
        numSubscriptions: 0,
      };
    }

    this.setEntity(newEntity);
    const numServicesPulled = await writeEntityServices(
      this.rootUri,
      newEntity,
    );

    const numSubscriptionsPulled = await writeEntitySubscriptions(
      this.rootUri,
      newEntity,
    );

    return {
      numServices: numServicesPulled,
      numSubscriptions: numSubscriptionsPulled,
    };
  }

  /**
   * Pulls every entity of a project and writes all their services and
   * subscriptions to disk. Returns the total number of services and
   * subscriptions written.
   */
  async pullProject(projectMeta: ProjectMeta): Promise<EntityDataCount> {
    if (this.workingTreeGroup.resourceStates.length > 0) {
      throw new Error("Please push/discard all the changes first before pull.");
    }

    const entities = await fetchProjectEntity(this.config, projectMeta);

    const resultServices = await Promise.all(
      (entities || []).map(async (entity) => {
        return await writeEntityServices(this.rootUri, entity);
      }),
    );

    const resultSubscriptions = await Promise.all(
      (entities || []).map(async (entity) => {
        return await writeEntitySubscriptions(this.rootUri, entity);
      }),
    );

    // Sum up all the results
    const numServicesPulled = resultServices.reduce(
      (sum, count) => sum + count,
      0,
    );

    const numSubscriptionsPulled = resultSubscriptions.reduce(
      (sum, count) => sum + count,
      0,
    );
    return {
      numServices: numServicesPulled,
      numSubscriptions: numSubscriptionsPulled,
    };
  }

  /**
   * Reads the local service and subscription files, merges their source into the
   * entity, and PUTs the whole definition to ThingWorx using the source-control
   * comment. Refreshes the working tree afterwards and returns the number of
   * services and subscriptions pushed. Throws when there is nothing to push or
   * ThingWorx is ahead.
   */
  async push(): Promise<EntityDataCount> {
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

    const localSubscriptions = await readEntitySubscriptions(
      this.rootUri,
      this._entity.meta,
    );
    for (const subscription of localSubscriptions) {
      this._entity.updateSubscription(subscription.name, subscription.source);
    }

    await updateEntity(
      this.config,
      this._entity,
      this.sourceControl.inputBox.value,
    );

    const pushedEntity = await fetchEntity(this.config, this._entity.meta);
    this.setEntity(pushedEntity);
    await this.updateWorkingTreeGroup();

    this.sourceControl.inputBox.value = "";

    return {
      numServices: localServices.length,
      numSubscriptions: localSubscriptions.length,
    };
  }

  /**
   * Binds the repository to a different entity, writing that entity's
   * non-dirty services and subscriptions to disk and remembering it in the
   * config.
   */
  async switchEntity(entityMeta: EntityMeta): Promise<void> {
    const entity = await fetchEntity(this.config, entityMeta);
    this.setEntity(entity);
    await this.updateWorkingTreeGroup();
    await this.writeNonDirtyServices();
    await this.writeNonDirtySubscriptions();

    this.config.entityName = entityMeta.name;
    await this.config.save();
  }

  /**
   * Restores a local service or subscription file from the active entity's
   * current remote snapshot.
   */
  async discard(localUri: vscode.Uri): Promise<void> {
    const [kind, artifact] = this.getArtifactFromLocalUri(localUri);

    if (kind === "service") {
      await writeEntityService(this.rootUri, this._entity.meta, artifact);
    } else {
      await writeEntitySubscription(this.rootUri, this._entity.meta, artifact);
    }
  }

  private getArtifactFromLocalUri(
    localUri: vscode.Uri,
  ): readonly ["service", Service] | readonly ["subscription", Subscription] {
    const filename = path.basename(localUri.fsPath);

    const service = this._entity
      .getServices()
      .find((service) => service.name + service.extension === filename);
    if (service) {
      return ["service", service] as const;
    }

    const subscription = this._entity
      .getSubscriptions()
      .find(
        (subscription) =>
          subscription.name + subscription.extension === filename,
      );
    if (subscription) {
      return ["subscription", subscription] as const;
    }

    throw new Error(
      `${filename} does not exist on entity ${this._entity.meta.name}`,
    );
  }

  private setEntity(entity: Entity): void {
    this._entity = entity;
    this._onEntityChange.fire(entity);
    this.refreshStatusBar();
  }

  private isTrackedDirty(localUri: vscode.Uri): boolean {
    return this.workingTreeGroup.resourceStates.some(
      (resourceState) =>
        resourceState.resourceUri.toString() === localUri.toString() &&
        resourceState.contextValue === "dirty",
    );
  }

  private async writeNonDirtyServices(): Promise<void> {
    const servicesToBeWritten = this._entity
      .getServices()
      .filter(
        (service) =>
          !this.isTrackedDirty(
            this.getLocalUriFromArtifact("service", service),
          ),
      );

    await writeServices(this.rootUri, this._entity.meta, servicesToBeWritten);
  }

  private async writeNonDirtySubscriptions(): Promise<void> {
    const subscriptionsToBeWritten = this._entity
      .getSubscriptions()
      .filter(
        (subscription) =>
          !this.isTrackedDirty(
            this.getLocalUriFromArtifact("subscription", subscription),
          ),
      );
    await writeSubscriptions(
      this.rootUri,
      this._entity.meta,
      subscriptionsToBeWritten,
    );
  }

  private async writeProjectNonDirtyServices(
    entities?: Entity[],
  ): Promise<void> {
    const servicesToBeWritten:
      | Array<{ entity: Entity; services: Service[] }>
      | undefined = entities?.map((entity) => {
      return {
        entity,
        services: entity.getServices().filter((service) => {
          const localUri = this.getLocalUriFromArtifact("service", service);
          const isDirty = this.workingTreeGroup.resourceStates.find(
            (resourceState) =>
              resourceState.resourceUri.toString() === localUri.toString() &&
              resourceState.contextValue === "dirty",
          );
          return !isDirty;
        }),
      };
    });

    if (servicesToBeWritten?.length) {
      await Promise.all(
        servicesToBeWritten.map(async (entityServicesPair) => {
          await writeServices(
            this.rootUri,
            entityServicesPair.entity.meta,
            entityServicesPair.services,
          );
        }),
      );
    }
  }

  private async writeProjectNonDirtySubscriptions(
    entities?: Entity[],
  ): Promise<void> {
    const subscriptionsToBeWritten:
      | Array<{ entity: Entity; subscriptions: Subscription[] }>
      | undefined = entities?.map((entity) => {
      return {
        entity,
        subscriptions: entity.getSubscriptions().filter((subscription) => {
          const localUri = this.getLocalUriFromArtifact(
            "subscription",
            subscription,
          );

          const isDirty = this.workingTreeGroup.resourceStates.find(
            (resourceState) =>
              resourceState.resourceUri.toString() === localUri.toString() &&
              resourceState.contextValue === "dirty",
          );

          return !isDirty;
        }),
      };
    });

    if (subscriptionsToBeWritten?.length) {
      await Promise.all(
        subscriptionsToBeWritten.map(async (entitySubscriptionsPair) => {
          await writeSubscriptions(
            this.rootUri,
            entitySubscriptionsPair.entity.meta,
            entitySubscriptionsPair.subscriptions,
          );
        }),
      );
    }
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
    const entries: Array<readonly [Service | Subscription, vscode.Uri]> = [
      ...this._entity
        .getServices()
        .map(
          (service) =>
            [
              service,
              this.getLocalUriFromArtifact("service", service),
            ] as const,
        ),
      ...this._entity
        .getSubscriptions()
        .map(
          (subscription) =>
            [
              subscription,
              this.getLocalUriFromArtifact("subscription", subscription),
            ] as const,
        ),
    ];

    for (const [artifact, localUri] of entries) {
      let state: State = "synced";

      try {
        await vscode.workspace.fs.stat(localUri);
        const document = await vscode.workspace.openTextDocument(localUri);
        const isDirty =
          normalizeEol(artifact.source) !== normalizeEol(document.getText());

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
        workingTreeResources.push(
          this.toSourceControlResourceState(localUri, state),
        );
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

  private getLocalUriFromArtifact(
    kind: ArtifactKind,
    artifact: Service | Subscription,
  ): vscode.Uri {
    return vscode.Uri.joinPath(
      this.rootUri,
      ...buildArtifactRelativePath(
        this._entity.meta,
        kind,
        artifact.name,
        artifact.extension,
      ),
    );
  }
}
