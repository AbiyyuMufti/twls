import * as vscode from "vscode";
import { CommandRunner } from "../../command-runner";
import { FeatureCommands } from "../../feature-commands";
import { Model } from "../../model";

export class StashCommands implements FeatureCommands {
  private disposables: vscode.Disposable[] = [];

  constructor(
    _model: Model,
    private runner: CommandRunner,
  ) {
    this.disposables.push(
      vscode.commands.registerCommand(
        "twls.stash",
        (sourceControl?: vscode.SourceControl) => {
          this.runner.run("Stash", () => this.stash(sourceControl?.rootUri));
        },
      ),
      vscode.commands.registerCommand(
        "twls.stashList",
        (sourceControl?: vscode.SourceControl) => {
          this.runner.run("Stash List", () => this.stashList(sourceControl?.rootUri));
        },
      ),
      vscode.commands.registerCommand(
        "twls.stashApply",
        (sourceControl?: vscode.SourceControl) => {
          this.runner.run("Stash Apply", () =>
            this.stashApply(sourceControl?.rootUri),
          );
        },
      ),
      vscode.commands.registerCommand(
        "twls.stashPop",
        (sourceControl?: vscode.SourceControl) => {
          this.runner.run("Stash Pop", () => this.stashPop(sourceControl?.rootUri));
        },
      ),
    );
  }

  async stash(rootUri?: vscode.Uri): Promise<void> {
    const repo = await this.runner.resolveRepository(rootUri);

    if (!repo) {
      return;
    }

    const count = await repo.stash();

    if (count === 0) {
      this.runner.notify("Nothing to stash — working tree is clean.", "warn");
      return;
    }

    this.runner.notify(
      `Stashed ${count} file(s). Working tree is clean — you can pull now.`,
    );
  }

  async stashList(rootUri?: vscode.Uri): Promise<void> {
    const repo = await this.runner.resolveRepository(rootUri);

    if (!repo) {
      return;
    }

    const entries = await repo.stashList();

    if (entries.length === 0) {
      this.runner.notify("No stashes for this repository.");
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
      this.runner.notify(`Applied ${count ?? 0} file(s) from stash.`);
    } else if (action) {
      const count = await repo.stashPop(selected.id);
      this.runner.notify(`Popped ${count ?? 0} file(s) from stash.`);
    }
  }

  async stashApply(rootUri?: vscode.Uri): Promise<void> {
    const repo = await this.runner.resolveRepository(rootUri);

    if (!repo) {
      return;
    }

    const count = await repo.stashApply();

    if (count === undefined) {
      this.runner.notify("No stash to apply.", "warn");
      return;
    }

    this.runner.notify(
      `Applied ${count} file(s) from the latest stash. Compare against the remote to resolve any conflicts.`,
    );
  }

  async stashPop(rootUri?: vscode.Uri): Promise<void> {
    const repo = await this.runner.resolveRepository(rootUri);

    if (!repo) {
      return;
    }

    const count = await repo.stashPop();

    if (count === undefined) {
      this.runner.notify("No stash to pop.", "warn");
      return;
    }

    this.runner.notify(
      `Popped ${count} file(s) from the latest stash. Compare against the remote to resolve any conflicts.`,
    );
  }

  dispose(): void {
    this.disposables.forEach((disposable) => {
      disposable.dispose();
    });
  }
}
