import path from "node:path";
import * as vscode from "vscode";
import { Config } from "./config";
import { logger } from "./logger";
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
        this.run("Initialize", () => this.init());
      }),
      vscode.commands.registerCommand(
        "twls.pull",
        (sourceControl?: vscode.SourceControl) => {
          this.run("Pull", () => this.pull(sourceControl?.rootUri));
        },
      ),
      vscode.commands.registerCommand(
        "twls.pullProject",
        (sourceControl?: vscode.SourceControl) => {
          this.run("Pull Project", () =>
            this.pullProject(sourceControl?.rootUri),
          );
        },
      ),
      vscode.commands.registerCommand(
        "twls.push",
        (sourceControl?: vscode.SourceControl) => {
          this.run("Push", () => this.push(sourceControl?.rootUri));
        },
      ),
      vscode.commands.registerCommand(
        "twls.switchEntity",
        (rootUri?: vscode.Uri) => {
          this.run("Switch Entity", () => this.switchEntity(rootUri));
        },
      ),
      vscode.commands.registerCommand(
        "twls.discard",
        (resourceState: vscode.SourceControlResourceState) => {
          this.run("Discard", () => this.discard(resourceState.resourceUri));
        },
      ),
      vscode.commands.registerCommand(
        "twls.stash",
        (sourceControl?: vscode.SourceControl) => {
          this.run("Stash", () => this.stash(sourceControl?.rootUri));
        },
      ),
      vscode.commands.registerCommand(
        "twls.stashList",
        (sourceControl?: vscode.SourceControl) => {
          this.run("Stash List", () => this.stashList(sourceControl?.rootUri));
        },
      ),
      vscode.commands.registerCommand(
        "twls.stashApply",
        (sourceControl?: vscode.SourceControl) => {
          this.run("Stash Apply", () =>
            this.stashApply(sourceControl?.rootUri),
          );
        },
      ),
      vscode.commands.registerCommand(
        "twls.stashPop",
        (sourceControl?: vscode.SourceControl) => {
          this.run("Stash Pop", () => this.stashPop(sourceControl?.rootUri));
        },
      ),
      vscode.commands.registerCommand("twls.showOutput", () => {
        logger.show();
      }),
    );
  }

  /**
   * Runs a command handler with a visible loading state (status-bar message
   * plus a spinner on the Source Control icon) and logs start/failure to the
   * TWLS output channel. On failure, shows an error toast with a "Show
   * Output" action so the stack trace is one click away.
   */
  private run(label: string, fn: () => Promise<void>): void {
    logger.info(`${label}…`);

    const promise = vscode.window.withProgress(
      { location: vscode.ProgressLocation.SourceControl, title: label },
      fn,
    );

    vscode.window.setStatusBarMessage(`$(sync~spin) TWLS: ${label}…`, promise);

    void Promise.resolve(promise)
      .then(() => {})
      .catch((error: unknown) => {
        let message: string;

        if (error instanceof Error) {
          message = error.message;
        } else if (typeof error === "string") {
          message = error;
        } else {
          message = JSON.stringify(error);
        }

        logger.error(`${label} failed: ${message}`, error);

        void vscode.window
          .showErrorMessage(message, "Show Output")
          .then((selection) => {
            if (selection === "Show Output") {
              logger.show();
            }
          });
      });
  }

  /** Logs a result and shows it as an info or warning toast. */
  private notify(message: string, level: "info" | "warn" = "info"): void {
    if (level === "warn") {
      logger.warn(message);
      void vscode.window.showWarningMessage(message);
    } else {
      logger.info(message);
      void vscode.window.showInformationMessage(message);
    }
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

    this.notify("TWLS initialized successfully.");
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

  async pull(rootUri?: vscode.Uri): Promise<void> {
    const repo = await this.resolveRepository(rootUri);

    if (!repo) {
      return;
    }

    const { numServices, numSubscriptions } = await repo.pull();

    if (numServices === 0 && numSubscriptions === 0) {
      this.notify(
        "All services and subscriptions are up to date with ThingWorx",
      );
    } else {
      this.notify(
        `Pulled ${numServices} service(s) and ${numSubscriptions} subscription(s) from ${repo.entity.meta.name} successfully.`,
      );
    }
  }

  async pullProject(rootUri?: vscode.Uri): Promise<void> {
    const repo = await this.resolveRepository(rootUri);

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
      this.notify(
        `All services from entities of ${projectMeta.name} are up to date with ThingWorx`,
      );
    } else {
      this.notify(
        `Pulled ${numServices} service(s) and ${numSubscriptions} subscription(s) from entities of ${projectMeta.name} successfully.`,
      );
    }
  }

  async push(rootUri?: vscode.Uri): Promise<void> {
    const repo = await this.resolveRepository(rootUri);

    if (!repo) {
      return;
    }

    const { numServices, numSubscriptions } = await repo.push();
    this.notify(
      `Pushed ${numServices} service(s) and ${numSubscriptions} subscription(s) to ${repo.entity.meta.name} successfully.`,
    );
  }

  async switchEntity(rootUri?: vscode.Uri): Promise<void> {
    const repo = await this.resolveRepository(rootUri);

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
    this.notify(`Entity switched to ${entityMeta.name} successfully.`);
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

    const filename = path.basename(localUri.fsPath);
    const selected = await vscode.window.showWarningMessage(
      `Are you sure you want to discard ${filename}? Any changes will be lost.`,
      "Discard",
      "Cancel",
    );

    if (selected === "Discard") {
      await repo.discard(localUri);
      this.notify(`Discarded ${filename}.`);
    }
  }

  async stash(rootUri?: vscode.Uri): Promise<void> {
    const repo = await this.resolveRepository(rootUri);

    if (!repo) {
      return;
    }

    const count = await repo.stash();

    if (count === 0) {
      this.notify("Nothing to stash — working tree is clean.", "warn");
      return;
    }

    this.notify(
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
      this.notify("No stashes for this repository.");
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
      this.notify(`Applied ${count ?? 0} file(s) from stash.`);
    } else if (action) {
      const count = await repo.stashPop(selected.id);
      this.notify(`Popped ${count ?? 0} file(s) from stash.`);
    }
  }

  async stashApply(rootUri?: vscode.Uri): Promise<void> {
    const repo = await this.resolveRepository(rootUri);

    if (!repo) {
      return;
    }

    const count = await repo.stashApply();

    if (count === undefined) {
      this.notify("No stash to apply.", "warn");
      return;
    }

    this.notify(
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
      this.notify("No stash to pop.", "warn");
      return;
    }

    this.notify(
      `Popped ${count} file(s) from the latest stash. Compare against the remote to resolve any conflicts.`,
    );
  }

  dispose(): void {
    this.disposables.forEach((disposable) => {
      disposable.dispose();
    });
  }
}
