import * as vscode from "vscode";
import { Config } from "./config";
import {
  fetchEntity,
  showEntityMetaPick,
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

  push(): void {
    throw new Error("Method not implemented.");
  }
}
