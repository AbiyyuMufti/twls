import * as vscode from "vscode";
import { logger } from "./logger";
import { Model } from "./features/sync/model";
import { Repository } from "./features/sync/repository";

export class CommandRunner {
  constructor(private model: Model) {}

  getRepository(rootUri: vscode.Uri): Repository | undefined {
    return this.model.getRepository(rootUri);
  }

  async resolveRepository(
    rootUri?: vscode.Uri,
  ): Promise<Repository | undefined> {
    await this.model.waitUntilReady();

    if (rootUri) {
      return this.model.getRepository(rootUri);
    }

    const repositories = this.model.getRepositories();

    if (repositories.size === 1) {
      return repositories.values().next().value;
    }

    return this.model.showRepositoryPick({
      placeHolder: "Pick repository",
      ignoreFocusOut: true,
    });
  }

  run(label: string, fn: () => Promise<void>): void {
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

  notify(message: string, level: "info" | "warn" = "info"): void {
    if (level === "warn") {
      logger.warn(message);
      void vscode.window.showWarningMessage(message);
    } else {
      logger.info(message);
      void vscode.window.showInformationMessage(message);
    }
  }
}
