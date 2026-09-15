import path from "node:path";
import * as vscode from "vscode";
import { Config } from "./config";
import { Model } from "./model";
import { Repository } from "./repository";
import {
  fetchProjectEntity,
  showEntityMetaPick,
  showProjectMetaPick,
} from "./thingworx";
import { EntityMeta } from "./entity/entity";

/**
 * Registers all `twls.*` VS Code commands and wires them to the shared
 * {@link Model}. Commands invoked from source control pass a root URI / source
 * control state so the right repository can be targeted directly.
 */
export class Commands implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  constructor(private model: Model) {
    this.disposables.push(
      vscode.commands.registerCommand("twls.init", () => {
        this.run(() => this.init());
      }),
      vscode.commands.registerCommand(
        "twls.pull",
        (sourceControl?: vscode.SourceControl) => {
          this.run(() => this.pull(sourceControl?.rootUri));
        },
      ),
      vscode.commands.registerCommand(
        "twls.pullProject",
        (sourceControl?: vscode.SourceControl) => {
          this.run(() => this.pullProject(sourceControl?.rootUri));
        },
      ),
      vscode.commands.registerCommand(
        "twls.push",
        (sourceControl?: vscode.SourceControl) => {
          this.run(() => this.push(sourceControl?.rootUri));
        },
      ),
      vscode.commands.registerCommand(
        "twls.switchEntity",
        (rootUri?: vscode.Uri) => {
          this.run(() => this.switchEntity(rootUri));
        },
      ),
      vscode.commands.registerCommand(
        "twls.discard",
        (resourceState: vscode.SourceControlResourceState) => {
          this.run(() => this.discard(resourceState.resourceUri));
        },
      ),
      vscode.commands.registerCommand(
        "twls.stash",
        (sourceControl?: vscode.SourceControl) => {
          this.run(() => this.stash(sourceControl?.rootUri));
        },
      ),
      vscode.commands.registerCommand(
        "twls.stashList",
        (sourceControl?: vscode.SourceControl) => {
          this.run(() => this.stashList(sourceControl?.rootUri));
        },
      ),
      vscode.commands.registerCommand(
        "twls.stashApply",
        (sourceControl?: vscode.SourceControl) => {
          this.run(() => this.stashApply(sourceControl?.rootUri));
        },
      ),
      vscode.commands.registerCommand(
        "twls.stashPop",
        (sourceControl?: vscode.SourceControl) => {
          this.run(() => this.stashPop(sourceControl?.rootUri));
        },
      ),
    );
  }

  /** Runs a command handler and logs failures, showing error instances as a toast. */
  private run(fn: () => Promise<void>): void {
    Promise.resolve()
      .then(fn)
      .catch((error: unknown) => {
        if (error instanceof Error) {
          void vscode.window.showErrorMessage(error.message);
        }

        console.error(error);
      });
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

    await vscode.window.showInformationMessage(
      "TWLS initialized successfully.",
    );
  }

  async pull(rootUri?: vscode.Uri): Promise<void> {
    let repo: Repository | undefined;

    if (rootUri) {
      repo = this.model.getRepository(rootUri);
    } else {
      repo = await this.model.showRepositoryPick({
        placeHolder: "Pick repository",
        ignoreFocusOut: true,
      });
    }

    if (!repo) {
      return;
    }

    const { numServices, numSubscriptions } = await repo.pull();
    let message: string;

    if (numServices === 0 && numSubscriptions === 0) {
      message = "All services and subscriptions are up to date with ThingWorx";
    } else {
      message = `Pulled ${numServices} service(s) and ${numSubscriptions} subscription(s) from ${repo.entity.meta.name} successfully.`;
    }

    await vscode.window.showInformationMessage(message);
  }

  async pullProject(rootUri?: vscode.Uri): Promise<void> {
    let repo: Repository | undefined;

    if (rootUri) {
      repo = this.model.getRepository(rootUri);
    } else {
      repo = await this.model.showRepositoryPick({
        placeHolder: "Pick repository",
        ignoreFocusOut: true,
      });
    }

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
    let message: string;

    if (numServices === 0 && numSubscriptions === 0) {
      message = `All services from entities of ${projectMeta.name} are up to date with ThingWorx`;
    } else {
      message = `Pulled ${numServices} service(s) and ${numSubscriptions} subscription(s) from entities of ${projectMeta.name} successfully.`;
    }

    await vscode.window.showInformationMessage(message);
  }

  async push(rootUri?: vscode.Uri): Promise<void> {
    let repo: Repository | undefined;

    if (rootUri) {
      repo = this.model.getRepository(rootUri);
    } else {
      repo = await this.model.showRepositoryPick({
        placeHolder: "Pick repository",
        ignoreFocusOut: true,
      });
    }

    if (!repo) {
      return;
    }

    const { numServices, numSubscriptions } = await repo.push();
    await vscode.window.showInformationMessage(
      `Pushed ${numServices} service(s) and ${numSubscriptions} subscription(s) to ${repo.entity.meta.name} successfully.`,
    );
  }

  private async resolveRepository(
    rootUri?: vscode.Uri,
  ): Promise<Repository | undefined> {
    if (rootUri) {
      return this.model.getRepository(rootUri);
    }

    return this.model.showRepositoryPick({
      placeHolder: "Pick repository",
      ignoreFocusOut: true,
    });
  }

  async stash(rootUri?: vscode.Uri): Promise<void> {
    const repo = await this.resolveRepository(rootUri);

    if (!repo) {
      return;
    }

    const count = await repo.stash();

    if (count === 0) {
      await vscode.window.showInformationMessage(
        "Nothing to stash — working tree is clean.",
      );
      return;
    }

    await vscode.window.showInformationMessage(
      `Stashed ${count} file(s). Working tree is clean — you can pull now.`,
    );
  }

  async stashList(rootUri?: vscode.Uri): Promise<void> {
    const repo = await this.resolveRepository(rootUri);

    if (!repo) {
      return;
    }

    const entries = await repo.stashList();

    if (entries.length === 0) {
      await vscode.window.showInformationMessage(
        "No stashes for this repository.",
      );
      return;
    }

    const items = entries.map((entry) => ({
      label: `${entry.entityName} — ${entry.files.length} file(s)`,
      description: new Date(entry.createdAt).toLocaleString(),
      id: entry.id,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Stashes",
      ignoreFocusOut: true,
    });

    if (!selected) {
      return;
    }

    const action = await vscode.window.showQuickPick(
      ["Apply", "Pop (apply + remove from list)"],
      {
        placeHolder: "What do you want to do with this stash?",
        ignoreFocusOut: true,
      },
    );

    if (action === "Apply") {
      const count = await repo.stashApply(selected.id);
      await vscode.window.showInformationMessage(
        `Applied ${count ?? 0} file(s) from stash.`,
      );
    } else if (action) {
      const count = await repo.stashPop(selected.id);
      await vscode.window.showInformationMessage(
        `Popped ${count ?? 0} file(s) from stash.`,
      );
    }
  }

  async stashApply(rootUri?: vscode.Uri): Promise<void> {
    const repo = await this.resolveRepository(rootUri);

    if (!repo) {
      return;
    }

    const count = await repo.stashApply();

    if (count === undefined) {
      await vscode.window.showInformationMessage("No stash to apply.");
      return;
    }

    await vscode.window.showInformationMessage(
      `Applied ${count} file(s) from the latest stash. Compare against the remote to resolve any conflicts.`,
    );
  }

  async stashPop(rootUri?: vscode.Uri): Promise<void> {
    const repo = await this.resolveRepository(rootUri);

    if (!repo) {
      return;
    }

    const count = await repo.stashPop();

    if (count === undefined) {
      await vscode.window.showInformationMessage("No stash to pop.");
      return;
    }

    await vscode.window.showInformationMessage(
      `Popped ${count} file(s) from the latest stash. Compare against the remote to resolve any conflicts.`,
    );
  }

  async switchEntity(rootUri?: vscode.Uri): Promise<void> {
    let repo: Repository | undefined;

    if (rootUri) {
      repo = this.model.getRepository(rootUri);
    } else {
      repo = await this.model.showRepositoryPick({
        placeHolder: "Pick repository",
        ignoreFocusOut: true,
      });
    }

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
    await vscode.window.showInformationMessage(
      `Entity switched to ${entityMeta.name} successfully.`,
    );
  }

  async discard(localUri: vscode.Uri): Promise<void> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(localUri);

    if (!workspaceFolder) {
      throw new Error(`Expected ${localUri.fsPath} to be in a workspace.`);
    }

    const repo = this.model.getRepository(workspaceFolder.uri);

    if (!repo) {
      return;
    }

    const selected = await vscode.window.showWarningMessage(
      `Are you sure you want to discard ${path.basename(localUri.fsPath)}? Any changes will be lost.`,
      "Discard",
      "Cancel",
    );

    if (selected === "Discard") {
      await repo.discard(localUri);
    }
  }

  dispose(): void {
    this.disposables.forEach((disposable) => {
      disposable.dispose();
    });
  }
}
