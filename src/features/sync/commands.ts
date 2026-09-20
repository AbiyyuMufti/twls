import path from "node:path";
import * as vscode from "vscode";
import { Config } from "../../config";
import { CommandRunner } from "../../command-runner";
import { FeatureCommands } from "../../feature-commands";
import { fetchProjectEntity } from "../../core/thingworx/entity";
import { showEntityMetaPick, showProjectMetaPick } from "../pickers/quick-pick";
import { EntityMeta } from "../../core/entity/entity";

/**
 * Registers all `twls.*` VS Code commands and wires them to the shared
 * {@link Model}. Commands invoked from source control pass a root URI / source
 * control state so the right repository can be targeted directly.
 */
export class RepositoryCommands implements FeatureCommands {
  private disposables: vscode.Disposable[] = [];

  constructor(private runner: CommandRunner) {
    this.disposables.push(
      vscode.commands.registerCommand("twls.init", () => {
        this.runner.run("Initialize", () => this.init());
      }),
      vscode.commands.registerCommand(
        "twls.pull",
        (sourceControl?: vscode.SourceControl) => {
          this.runner.run("Pull", () => this.pull(sourceControl?.rootUri));
        },
      ),
      vscode.commands.registerCommand(
        "twls.pullProject",
        (sourceControl?: vscode.SourceControl) => {
          this.runner.run("Pull Project", () =>
            this.pullProject(sourceControl?.rootUri),
          );
        },
      ),
      vscode.commands.registerCommand(
        "twls.push",
        (sourceControl?: vscode.SourceControl) => {
          this.runner.run("Push", () => this.push(sourceControl?.rootUri));
        },
      ),
      vscode.commands.registerCommand(
        "twls.switchEntity",
        (rootUri?: vscode.Uri) => {
          this.runner.run("Switch Entity", () => this.switchEntity(rootUri));
        },
      ),
      vscode.commands.registerCommand(
        "twls.discard",
        (resourceState: vscode.SourceControlResourceState) => {
          this.runner.run("Discard", () =>
            this.discard(resourceState.resourceUri),
          );
        },
      ),
      vscode.commands.registerCommand(
        "twls.newService",
        (sourceControl?: vscode.SourceControl) => {
          this.runner.run("New Service", () =>
            this.newService(sourceControl?.rootUri),
          );
        },
      ),
    );
  }

  /**
   * Wizard that turns a workspace folder into a TWLS repository: asks for the
   * ThingWorx base URL and app key, lets the user pick a project (and entity
   * when the project has none), then writes the `.twls` config.
   */
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

    const projectMeta = await showProjectMetaPick(config, {
      placeHolder: "Pick project",
      ignoreFocusOut: true,
    });

    if (!projectMeta) {
      return;
    }

    const entities = await fetchProjectEntity(config, projectMeta);

    let entityMeta: EntityMeta | undefined;
    if (!entities || entities.length <= 0) {
      entityMeta = await showEntityMetaPick(config, {
        placeHolder: "Pick entity",
        ignoreFocusOut: true,
      });

      if (!entityMeta) {
        return;
      }
    }

    config.entityName =
      (entities ? entities[0]?.meta?.name : entityMeta?.name) || "";

    await config.save();

    this.runner.notify("TWLS initialized successfully.");
  }

  async newService(rootUri?: vscode.Uri): Promise<void> {
    const repo = await this.runner.resolveRepository(rootUri);

    if (!repo) {
      return;
    }

    const name = await vscode.window.showInputBox({
      prompt: "New service name",
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value) {
          return "Name is required.";
        }
        if (
          repo.entity.getServices().some((service) => service.name === value)
        ) {
          return `A service named "${value}" already exists on this entity.`;
        }
        return undefined;
      },
    });

    if (!name) {
      return;
    }

    const kindOptions: Array<"JavaScript" | "SQL"> =
      repo.entity.meta.type === "ThingTemplate"
        ? ["JavaScript", "SQL"]
        : ["JavaScript"];

    const kindPick =
      kindOptions.length > 1
        ? await vscode.window.showQuickPick(kindOptions, {
            placeHolder: "Service kind",
            ignoreFocusOut: true,
          })
        : kindOptions[0];

    if (!kindPick) {
      return;
    }

    await repo.scaffoldNewService(name, kindPick === "SQL" ? "sql" : "js");

    this.runner.notify(
      `Created local boilerplate for "${name}". Edit the .definition and code files — pushing a brand-new service isn't wired up yet, that's next.`,
    );
  }

  async pull(rootUri?: vscode.Uri): Promise<void> {
    const repo = await this.runner.resolveRepository(rootUri);

    if (!repo) {
      return;
    }

    const { numServices, numSubscriptions, numServiceDefinitions } =
      await repo.pull();

    if (numServices === 0 && numSubscriptions === 0) {
      this.runner.notify(
        "All services and subscriptions are up to date with ThingWorx",
      );
    } else {
      this.runner.notify(
        `Pulled ${numServices} service(s) with ${numServiceDefinitions} definitions and ${numSubscriptions} subscription(s) from ${repo.entity.meta.name} successfully.`,
      );
    }
  }

  async pullProject(rootUri?: vscode.Uri): Promise<void> {
    const repo = await this.runner.resolveRepository(rootUri);

    if (!repo) {
      return;
    }

    const projectMeta = await showProjectMetaPick(repo.config, {
      placeHolder: "Pick project",
      ignoreFocusOut: true,
    });

    if (!projectMeta) {
      return;
    }

    const { numServices, numSubscriptions } =
      await repo.pullProject(projectMeta);

    if (numServices === 0 && numSubscriptions === 0) {
      this.runner.notify(
        `All services from entities of ${projectMeta.name} are up to date with ThingWorx`,
      );
    } else {
      this.runner.notify(
        `Pulled ${numServices} service(s) and ${numSubscriptions} subscription(s) from entities of ${projectMeta.name} successfully.`,
      );
    }
  }

  async push(rootUri?: vscode.Uri): Promise<void> {
    const repo = await this.runner.resolveRepository(rootUri);

    if (!repo) {
      return;
    }

    const { numServices, numSubscriptions } = await repo.push();
    this.runner.notify(
      `Pushed ${numServices} service(s) and ${numSubscriptions} subscription(s) to ${repo.entity.meta.name} successfully.`,
    );
  }

  async switchEntity(rootUri?: vscode.Uri): Promise<void> {
    const repo = await this.runner.resolveRepository(rootUri);

    if (!repo) {
      return;
    }

    const entityMeta = await showEntityMetaPick(repo.config, {
      placeHolder: "Pick entity to switch to",
      ignoreFocusOut: true,
    });

    if (!entityMeta) {
      return;
    }

    await repo.switchEntity(entityMeta);
    this.runner.notify(`Entity switched to ${entityMeta.name} successfully.`);
  }

  async discard(localUri: vscode.Uri): Promise<void> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(localUri);

    if (!workspaceFolder) {
      throw new Error(`Expected ${localUri.fsPath} to be in a workspace.`);
    }

    const repo = this.runner.getRepository(workspaceFolder.uri);

    if (!repo) {
      return;
    }

    const filename = path.basename(localUri.fsPath);
    const selected = await vscode.window.showWarningMessage(
      `Are you sure you want to discard ${filename}? Any changes will be lost.`,
      "Discard",
      "Cancel",
    );

    if (selected === "Discard") {
      await repo.discard(localUri);
      this.runner.notify(`Discarded ${filename}.`);
    }
  }

  dispose(): void {
    this.disposables.forEach((disposable) => {
      disposable.dispose();
    });
  }
}
