import * as vscode from "vscode";
import { CommandRunner } from "./command-runner";
import { FeatureCommands } from "./feature-commands";
import { RepositoryCommands } from "./features/sync/commands";
import { Model } from "./features/sync/model";
import { StashCommands } from "./features/stash/commands";
import { ServiceInvocationCommands } from "./features/service-invocation/commands";
import { logger } from "./logger";

export function activate(context: vscode.ExtensionContext): void {
  const model = new Model(context, vscode.workspace.workspaceFolders);
  const runner = new CommandRunner(model);
  const features: FeatureCommands[] = [
    new RepositoryCommands(runner),
    new StashCommands(runner),
    new ServiceInvocationCommands(runner, context.extensionUri),
  ];
  context.subscriptions.push(
    model,
    ...features,
    vscode.commands.registerCommand("twls.showOutput", () => {
      logger.show();
    }),
    logger,
  );
}

export function deactivate(): void {}
