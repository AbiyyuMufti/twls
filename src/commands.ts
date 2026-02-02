import * as vscode from "vscode";
import { Config } from "./config";
import { Model } from "./model";

export class Commands implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  constructor(private model: Model) {
    this.disposables.push(
      vscode.commands.registerCommand("twls.init", () => {
        this.init().catch((error) => {
          console.error(error);
        });
      }),
      vscode.commands.registerCommand("twls.pull", () => {
        this.pull().catch((error) => {
          console.error(error);
        });
      }),
    );
  }

  async init(): Promise<void> {
    const folder = await vscode.window.showWorkspaceFolderPick({
      placeHolder: "Pick workspace",
      ignoreFocusOut: true,
    });

    if (!folder) {
      return;
    }

    const baseUrl = await vscode.window.showInputBox({
      prompt: "Enter ThingWorx Base URL",
      placeHolder: "e.g. http://localhost:8080",
      ignoreFocusOut: true,
    });

    if (!baseUrl) {
      return;
    }

    const appKey = await vscode.window.showInputBox({
      prompt: "Enter ThingWorx Application Key",
      ignoreFocusOut: true,
    });

    if (!appKey) {
      return;
    }

    const config = new Config(folder.uri, baseUrl, appKey);
    await config.save();

    await vscode.window.showInformationMessage(
      "TWLS initialized successfully.",
    );
  }

  async pull(): Promise<void> {
    const repo = await this.model.showRepositoryPick({
      placeHolder: "Pick repository",
      ignoreFocusOut: true,
    });

    if (!repo) {
      return;
    }

    const [entityName, numServicesPulled] = await repo.pull();
    await vscode.window.showInformationMessage(
      `Pulled ${numServicesPulled} service(s) from ${entityName} successfully.`,
    );
  }

  dispose(): void {
    this.disposables.forEach((disposable) => {
      disposable.dispose();
    });
  }
}
