import * as vscode from "vscode";
import { CommandRunner } from "./command-runner";
import { FeatureCommands } from "./feature-commands";
import { Commands } from "./features/sync/commands";
import { StashCommands } from "./features/stash/commands";
import { logger } from "./logger";
import { Model } from "./model";
import { ServiceInvocationCommands } from "./features/service-invocation/commands";

export function activate(context: vscode.ExtensionContext): void {
  const model = new Model(context, vscode.workspace.workspaceFolders);
  const runner = new CommandRunner(model);
  const features: FeatureCommands[] = [
    new Commands(model, runner),
    new StashCommands(model, runner),
    new ServiceInvocationCommands(model, runner),
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
