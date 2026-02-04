import * as vscode from "vscode";
import { Config } from "./config";
import { Model } from "./model";
import { Repository } from "./repository";
import { showEntityMetaPick } from "./thingworx";

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
      vscode.commands.registerCommand("twls.push", () => {
        this.push().catch((error) => {
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

    const config = new Config(folder.uri, baseUrl, appKey, "");

    const entityMeta = await showEntityMetaPick(config, {
      placeHolder: "Pick entity",
      ignoreFocusOut: true,
    });

    if (!entityMeta) {
      return;
    }

    config.entityName = entityMeta.name;

    await config.save();

    await vscode.window.showInformationMessage(
      "TWLS initialized successfully.",
    );
  }

  async pull(): Promise<void> {
    let repo: Repository | undefined;

    if (this.model.repositoryCount === 1) {
      repo = this.model.getFirstRepository();
    } else {
      repo = await this.model.showRepositoryPick({
        placeHolder: "Pick repository",
        ignoreFocusOut: true,
      });
    }

    if (!repo) {
      return;
    }

    try {
      const numServicesPulled = await repo.pull();
      let message: string;

      if (numServicesPulled === 0) {
        message = "All services are up to date with ThingWorx";
      } else {
        message = `Pulled ${numServicesPulled} service(s) from ${repo.entity.meta.name} successfully.`;
      }

      await vscode.window.showInformationMessage(message);
    } catch (error) {
      if (error instanceof Error) {
        vscode.window.showErrorMessage(error.message);
      }
    }
  }

  async push(): Promise<void> {
    let repo: Repository | undefined;

    if (this.model.repositoryCount === 1) {
      repo = this.model.getFirstRepository();
    } else {
      repo = await this.model.showRepositoryPick({
        placeHolder: "Pick repository",
        ignoreFocusOut: true,
      });
    }

    if (!repo) {
      return;
    }

    try {
      const numServicesPushed = await repo.push();
      await vscode.window.showInformationMessage(
        `Pushed ${numServicesPushed} service(s) to ${repo.entity.meta.name} successfully.`,
      );
    } catch (error) {
      if (error instanceof Error) {
        vscode.window.showErrorMessage(error.message);
      }
    }
  }

  dispose(): void {
    this.disposables.forEach((disposable) => {
      disposable.dispose();
    });
  }
}
