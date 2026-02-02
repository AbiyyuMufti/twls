import * as vscode from "vscode";
import { Config } from "./config";
import {
  fetchEntity,
  readEntityServices,
  showEntityMetaPick,
  updateEntity,
  writeEntityServices,
} from "./thingworx";

export class Repository {
  constructor(
    private rootUri: vscode.Uri,
    private config: Config,
  ) {}

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
}
