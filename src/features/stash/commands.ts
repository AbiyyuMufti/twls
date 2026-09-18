import * as vscode from "vscode";
import { logger } from "../../logger";
import { Model } from "../sync/model";
import { Repository } from "../sync/repository";

export class StashCommands implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  constructor(private model: Model) {
    this.disposables.push(
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
    );
  }

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

  private notify(message: string, level: "info" | "warn" = "info"): void {
    if (level === "warn") {
      logger.warn(message);
      void vscode.window.showWarningMessage(message);
    } else {
      logger.info(message);
      void vscode.window.showInformationMessage(message);
    }
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
