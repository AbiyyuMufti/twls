import * as vscode from "vscode";
import { Config } from "./config";
import {
  Entity,
  fetchEntity,
  readEntityServices,
  searchEntityMeta,
  showEntityMetaPick,
  updateEntity,
  writeEntityServices,
} from "./thingworx";

export class Repository implements vscode.Disposable {
  private sourceControl: vscode.SourceControl;
  private workingTreeGroup: vscode.SourceControlResourceGroup;

  private _entity!: Entity;
  get entity(): Entity {
    return this._entity;
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

    this.setEntity(entity);
  }

  dispose(): void {
    this.sourceControl.dispose();
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
  }
}
