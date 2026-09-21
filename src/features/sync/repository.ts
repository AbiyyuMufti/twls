import path from "node:path";
import * as vscode from "vscode";
import { Config } from "../../config";
import { REMOTE_SCHEME } from "./remote";
import { normalizeEol } from "../../core/utilities/text";
import {
  Entity,
  entityMap,
  EntityMeta,
  getWatchedFilePattern,
} from "../../core/entity/entity";
import type { Service } from "../../core/entity/service-schema";
import type { Subscription } from "../../core/entity/subscription-schema";

import {
  fetchEntity,
  fetchProjectEntity,
  updateEntity,
} from "../../core/thingworx/entity";
import { ProjectMeta } from "../../core/entity/project";
import {
  searchEntityMeta,
  searchProjectMeta,
} from "../../core/thingworx/search";
import {
  readEntityServiceDefinition,
  writeEntityServiceDefinition,
  writeEntityServiceDefinitions,
} from "../service-definitions/storage";
import {
  readEntityServices,
  readEntitySubscriptions,
  writeEntityService,
  writeEntityServices,
  writeEntitySubscription,
  writeEntitySubscriptions,
  writeServices,
  writeSubscriptions,
} from "./storage";
import {
  ArtifactKind,
  buildArtifactRelativePath,
  resolveArtifact,
  buildArtifactFolderRelativePath,
  parseArtifactPath,
  ParsedArtifactPath,
} from "../../core/utilities/artifact-path";
import { createStashEntry, StashedFile, StashEntry } from "../stash/model";
import { StashStore } from "../stash/store";
import {
  buildServiceDefinitionTemplate,
  buildServiceDefinitionYaml,
  DEFINITION_EXTENSION,
} from "../service-definitions/templates";
import { dedupeByPreferredCase } from "../case-collision/detect";

/** Per-artifact sync status shown in the source-control "Changes" group. */
type State = "dirty" | "deleted" | "synced" | "new";

/** Number of services and subscriptions affected by a repository operation. */
export type EntityDataCount = {
  numServices: number;
  numSubscriptions: number;
  numServiceDefinitions: number;
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
  private stashStore: StashStore;

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
    this.stashStore = new StashStore(this.rootUri);

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
      new vscode.RelativePattern(rootUri, getWatchedFilePattern()),
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
    if (entities?.length === 0) {
      return;
    }

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
      throw new Error(
        "Please push, discard or stash all changes first before pull.",
      );
    }

    const newEntity = await fetchEntity(this.config, this._entity.meta);

    if (
      newEntity.getLastModifiedDate() === this._entity.getLastModifiedDate()
    ) {
      return {
        numServices: 0,
        numSubscriptions: 0,
        numServiceDefinitions: 0,
      };
    }

    this.setEntity(newEntity);
    const numServicesPulled = await writeEntityServices(
      this.rootUri,
      newEntity,
    );

    const numServiceDefinitionPulled = await writeEntityServiceDefinitions(
      this.rootUri,
      newEntity.meta,
      newEntity.getServices(),
      (name) => newEntity.getServiceDefinition(name),
      (name) => newEntity.getServiceQueryConfig(name),
    );

    const numSubscriptionsPulled = await writeEntitySubscriptions(
      this.rootUri,
      newEntity,
    );

    return {
      numServices: numServicesPulled,
      numSubscriptions: numSubscriptionsPulled,
      numServiceDefinitions: numServiceDefinitionPulled,
    };
  }

  /**
   * Pulls every entity of a project and writes all their services and
   * subscriptions to disk. Returns the total number of services and
   * subscriptions written.
   */
  async pullProject(projectMeta: ProjectMeta): Promise<EntityDataCount> {
    if (this.workingTreeGroup.resourceStates.length > 0) {
      throw new Error(
        "Please push, discard or stash all changes first before pull.",
      );
    }

    const entities = await fetchProjectEntity(this.config, projectMeta);

    const resultServices = await Promise.all(
      (entities || []).map(async (entity) => {
        return await writeEntityServices(this.rootUri, entity);
      }),
    );

    const resultServiceDefinitions = await Promise.all(
      (entities || []).map((entity) =>
        writeEntityServiceDefinitions(
          this.rootUri,
          entity.meta,
          entity.getServices(),
          (name) => entity.getServiceDefinition(name),
          (name) => entity.getServiceQueryConfig(name),
        ),
      ),
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

    const numServiceDefinitionsPulled = resultServiceDefinitions.reduce(
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
      numServiceDefinitions: numServiceDefinitionsPulled,
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
    const draft = new entityMap[this._entity.meta.type](
      this._entity.meta,
      structuredClone(this._entity.getSource()),
    );

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
    const knownServiceNames = new Set(
      this._entity.getServices().map((s) => s.name),
    );

    for (const service of localServices) {
      const localDefinition = await readEntityServiceDefinition(
        this.rootUri,
        this._entity.meta,
        service.name,
      );

      if (!knownServiceNames.has(service.name)) {
        if (!localDefinition) {
          throw new Error(
            `Created local boilerplate for "${service.name}". Edit the .yaml definition and code file, then push.`,
          );
        }

        draft.createService(
          service.name,
          localDefinition.definition,
          service.source,
          service.extension,
          localDefinition.queryConfig,
        );
        continue;
      }

      if (localDefinition) {
        draft.updateServiceDefinition(
          service.name,
          localDefinition.definition,
          localDefinition.queryConfig,
        );
      }
      draft.updateService(service.name, service.source);
    }

    const localSubscriptions = await readEntitySubscriptions(
      this.rootUri,
      this._entity.meta,
    );
    for (const subscription of localSubscriptions) {
      draft.updateSubscription(subscription.name, subscription.source);
    }

    await updateEntity(this.config, draft, this.sourceControl.inputBox.value);

    const pushedEntity = await fetchEntity(this.config, this._entity.meta);
    this.setEntity(pushedEntity);
    await this.updateWorkingTreeGroup();

    this.sourceControl.inputBox.value = "";

    return {
      numServices: localServices.length,
      numSubscriptions: localSubscriptions.length,
      numServiceDefinitions: localServices.length,
    };
  }

  /**
   * Snapshots every dirty, deleted or brand-new local file (code files and
   * `.yaml` sidecars) into a new stash entry, then puts those files back to
   * the last-pulled remote state so `pull()` can proceed. New files have no
   * remote counterpart, so they are removed locally instead. Only the
   * captured files are touched, so an edit that was not captured can never be
   * overwritten. Returns the number of files stashed (0 when nothing is dirty).
   */
  async stash(): Promise<number> {
    // Refresh first: the watcher that keeps `resourceStates` up to date is
    // debounced, so a just-saved edit may not be tracked yet. Capturing from a
    // stale snapshot would then let the reset below destroy that edit.
    await this.updateWorkingTreeGroup();

    const dirtyStates = this.workingTreeGroup.resourceStates;

    if (dirtyStates.length === 0) {
      return 0;
    }

    const files: StashedFile[] = [];

    for (const resourceState of dirtyStates) {
      const parsed = parseArtifactPath(resourceState.resourceUri.fsPath);

      if (!parsed) {
        throw new Error(
          `${path.basename(resourceState.resourceUri.fsPath)} is not a service or subscription file.`,
        );
      }

      const relativePath = buildArtifactRelativePath(
        this._entity.meta,
        parsed.kind,
        parsed.name,
        parsed.extension,
      );

      if (resourceState.contextValue === "deleted") {
        files.push({
          relativePath,
          kind: parsed.kind,
          deleted: true,
          content: "",
        });
        continue;
      }

      const document = await vscode.workspace.openTextDocument(
        resourceState.resourceUri,
      );
      files.push({
        relativePath,
        kind: parsed.kind,
        deleted: false,
        content: document.getText(),
      });
    }

    // Saved before anything is reset, so a failure below can't lose an edit.
    const entry = createStashEntry(this._entity.meta.name, files);
    await this.stashStore.save(entry);

    for (const resourceState of dirtyStates) {
      await this.discard(resourceState.resourceUri);
    }
    await this.updateWorkingTreeGroup();

    return files.length;
  }

  /**
   * Lists stash entries belonging to the active entity, newest first. Stashes
   * are stored per workspace folder and shared across every entity the folder
   * has been bound to, so entries for other entities are filtered out.
   */
  async stashList(): Promise<StashEntry[]> {
    const entries = await this.stashStore.list();
    return entries.filter(
      (entry) => entry.entityName === this._entity.meta.name,
    );
  }

  /**
   * Applies a stash entry's files onto the working tree without removing it
   * from the stash list. Applies the most recent entry when `id` is omitted.
   * Returns the number of files applied, or `undefined` when there's no
   * matching stash.
   */
  async stashApply(id?: string): Promise<number | undefined> {
    const entry = await this.resolveStashEntry(id);

    if (!entry) {
      return undefined;
    }

    await this.applyStashEntry(entry);
    return entry.files.length;
  }

  /** Like {@link stashApply}, but also removes the entry from the stash list. */
  async stashPop(id?: string): Promise<number | undefined> {
    const entry = await this.resolveStashEntry(id);

    if (!entry) {
      return undefined;
    }

    await this.applyStashEntry(entry);
    await this.stashStore.delete(entry.id);
    return entry.files.length;
  }

  private async resolveStashEntry(
    id?: string,
  ): Promise<StashEntry | undefined> {
    if (id) {
      const entry = await this.stashStore.read(id);

      if (entry && entry.entityName !== this._entity.meta.name) {
        throw new Error(
          `Cannot apply stash: it belongs to entity ${entry.entityName}, but ${this._entity.meta.name} is active. Switch to that entity first.`,
        );
      }

      return entry;
    }

    const entries = await this.stashList();
    return entries[0];
  }

  private async applyStashEntry(entry: StashEntry): Promise<void> {
    await this.updateWorkingTreeGroup();

    const dirtyUris = new Set(
      this.workingTreeGroup.resourceStates.map((resourceState) =>
        resourceState.resourceUri.toString(),
      ),
    );
    const conflicting = entry.files.filter((file) =>
      dirtyUris.has(
        vscode.Uri.joinPath(this.rootUri, ...file.relativePath).toString(),
      ),
    );

    if (conflicting.length > 0) {
      throw new Error(
        `Cannot apply stash: ${conflicting.length} file(s) have uncommitted changes. Push, discard or stash them first.`,
      );
    }

    for (const file of entry.files) {
      const localUri = vscode.Uri.joinPath(this.rootUri, ...file.relativePath);

      if (file.deleted) {
        await this.deleteFile(localUri);
      } else {
        await vscode.workspace.fs.writeFile(
          localUri,
          new TextEncoder().encode(file.content),
        );
      }
    }

    await this.updateWorkingTreeGroup();
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
    const parsed = parseArtifactPath(localUri.fsPath);

    if (
      parsed?.kind === "service" &&
      !this._entity
        .getServices()
        .some((service) => service.name === parsed.name)
    ) {
      await this.discardNewService(localUri, parsed);
      return;
    }

    if (
      parsed?.kind === "service" &&
      !this._entity
        .getServices()
        .some((service) => service.name === parsed.name)
    ) {
      await this.discardServiceDefinition(parsed.name);
      return;
    }

    const resolved = resolveArtifact(
      localUri.fsPath,
      this._entity.getServices(),
      this._entity.getSubscriptions(),
    );

    if (!resolved) {
      throw new Error(
        `${path.basename(localUri.fsPath)} does not exist on entity ${this._entity.meta.name}`,
      );
    }

    if (resolved.kind === "service") {
      await writeEntityService(
        this.rootUri,
        this._entity.meta,
        resolved.artifact,
      );
    } else {
      await writeEntitySubscription(
        this.rootUri,
        this._entity.meta,
        resolved.artifact,
      );
    }
  }

  /** Rewrites a service's `.yaml` sidecar from the current remote snapshot. */
  private async discardServiceDefinition(serviceName: string): Promise<void> {
    const definition = this._entity.getServiceDefinition(serviceName);

    if (!definition) {
      throw new Error(`Service definition not found: ${serviceName}`);
    }

    await writeEntityServiceDefinition(
      this.rootUri,
      this._entity.meta,
      serviceName,
      definition,
      this._entity.getServiceQueryConfig(serviceName),
    );
  }

  /**
   * A service the entity doesn't have yet has no remote snapshot to restore,
   * so discarding it means deleting it. Removing the code file takes its
   * `.yaml` sidecar with it: the sidecar is only listed next to its code file,
   * so it would otherwise be left behind, invisible.
   */
  private async discardNewService(
    localUri: vscode.Uri,
    parsed: ParsedArtifactPath,
  ): Promise<void> {
    await this.deleteFile(localUri);

    if (parsed.extension !== DEFINITION_EXTENSION) {
      await this.deleteFile(
        vscode.Uri.joinPath(
          this.rootUri,
          ...buildArtifactRelativePath(
            this._entity.meta,
            "service",
            parsed.name,
            DEFINITION_EXTENSION,
          ),
        ),
      );
    }
  }

  /**
   * Writes local boilerplate for a brand-new service: a `.definition`
   * sidecar plus a stub code file. Purely local — nothing is sent to
   * ThingWorx yet; wiring an actual create-and-push flow is the next slice.
   */
  async scaffoldNewService(name: string, kind: "js" | "sql"): Promise<void> {
    const extension = kind === "sql" ? ".sql" : ".js";

    const codeUri = vscode.Uri.joinPath(
      this.rootUri,
      ...buildArtifactRelativePath(
        this._entity.meta,
        "service",
        name,
        extension,
      ),
    );
    const definitionUri = vscode.Uri.joinPath(
      this.rootUri,
      ...buildArtifactRelativePath(
        this._entity.meta,
        "service",
        name,
        DEFINITION_EXTENSION,
      ),
    );

    const codeStub =
      kind === "sql" ? "-- New SQL service.\nSELECT 1;\n" : "// New service.\n";

    await vscode.workspace.fs.writeFile(
      codeUri,
      new TextEncoder().encode(codeStub),
    );
    await vscode.workspace.fs.writeFile(
      definitionUri,
      new TextEncoder().encode(buildServiceDefinitionTemplate(kind)),
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

  private async fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch (error) {
      if (error instanceof vscode.FileSystemError) {
        return false;
      }
      throw error;
    }
  }

  /** Deletes a file, treating "already gone" as success. */
  private async deleteFile(uri: vscode.Uri): Promise<void> {
    try {
      await vscode.workspace.fs.delete(uri);
    } catch (error) {
      if (!(error instanceof vscode.FileSystemError)) {
        throw error;
      }
    }
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

    await writeEntityServiceDefinitions(
      this.rootUri,
      this._entity.meta,
      servicesToBeWritten,
      (name) => this._entity.getServiceDefinition(name),
      (name) => this._entity.getServiceQueryConfig(name),
    );
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
        servicesToBeWritten.map(async ({ entity, services }) => {
          await writeServices(this.rootUri, entity.meta, services);
          await writeEntityServiceDefinitions(
            this.rootUri,
            entity.meta,
            services,
            (name) => entity.getServiceDefinition(name),
            (name) => entity.getServiceQueryConfig(name),
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

    const { kept: workingServices } = dedupeByPreferredCase(
      this._entity.getServices(),
    );

    const { kept: workingSubscriptions } = dedupeByPreferredCase(
      this._entity.getSubscriptions(),
    );

    const entries: Array<readonly [Service | Subscription, vscode.Uri]> = [
      ...workingServices.map(
        (service) =>
          [service, this.getLocalUriFromArtifact("service", service)] as const,
      ),
      ...workingSubscriptions.map(
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

    // Definition sidecars — services only, diffed against a freshly
    // rebuilt canonical form so YAML formatting quirks don't false-positive.
    for (const service of workingServices) {
      const definition = this._entity.getServiceDefinition(service.name);

      if (!definition) {
        continue;
      }

      const definitionUri = vscode.Uri.joinPath(
        this.rootUri,
        ...buildArtifactRelativePath(
          this._entity.meta,
          "service",
          service.name,
          DEFINITION_EXTENSION,
        ),
      );

      const queryConfig = this._entity.getServiceQueryConfig(service.name);
      const canonical = buildServiceDefinitionYaml(definition, queryConfig);

      let state: State = "synced";

      try {
        await vscode.workspace.fs.stat(definitionUri);
        const document = await vscode.workspace.openTextDocument(definitionUri);
        if (normalizeEol(document.getText()) !== normalizeEol(canonical)) {
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
          this.toSourceControlResourceState(definitionUri, state),
        );
      }
    }

    // Brand-new scaffolded services — no entity counterpart to diff against.
    for (const { name, codeUri } of await this.findUntrackedServiceFiles()) {
      workingTreeResources.push(
        this.toSourceControlResourceState(codeUri, "new"),
      );

      const definitionUri = vscode.Uri.joinPath(
        this.rootUri,
        ...buildArtifactRelativePath(
          this._entity.meta,
          "service",
          name,
          DEFINITION_EXTENSION,
        ),
      );

      // Manually created code files may have no definition sidecar — skip it then.
      if (await this.fileExists(definitionUri)) {
        workingTreeResources.push(
          this.toSourceControlResourceState(definitionUri, "new"),
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

      case "new":
        title += " (New)";
        command = {
          title,
          command: "vscode.open",
          arguments: [localUri, { preview: true }, title],
        };
        decorations = {
          iconPath: new vscode.ThemeIcon("diff-added"),
          tooltip: title,
        };
        break;

      case "synced":
        throw new Error(`Invalid state: ${state}`);
    }

    return {
      resourceUri: localUri,
      command: command,
      decorations: decorations,
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

  private async findUntrackedServiceFiles(): Promise<
    { name: string; codeUri: vscode.Uri }[]
  > {
    const folderUri = vscode.Uri.joinPath(
      this.rootUri,
      ...buildArtifactFolderRelativePath(this._entity.meta, "service"),
    );

    let files: [string, vscode.FileType][];
    try {
      files = await vscode.workspace.fs.readDirectory(folderUri);
    } catch {
      return [];
    }

    const knownNames = new Set(this._entity.getServices().map((s) => s.name));
    const codeFiles = files.filter(
      ([name]) => name.endsWith(".js") || name.endsWith(".sql"),
    );

    return codeFiles
      .map(([filename]) => {
        const extension = path.extname(filename);
        return {
          name: path.basename(filename, extension),
          codeUri: vscode.Uri.joinPath(folderUri, filename),
        };
      })
      .filter((f) => !knownNames.has(f.name));
  }
}
