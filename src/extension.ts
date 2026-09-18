import * as vscode from "vscode";
import { Commands } from "./features/sync/commands";
import { StashCommands } from "./features/stash/commands";
import { logger } from "./logger";
import { Model } from "./features/sync/model";
import { ServiceInvocationCommands } from "./service-invocation-commands";

export function activate(context: vscode.ExtensionContext): void {
  const model = new Model(context, vscode.workspace.workspaceFolders);
  const commands = new Commands(model);
  const stashCommands = new StashCommands(model);
  const serviceInvocationCommands = new ServiceInvocationCommands(model);
  context.subscriptions.push(
    model,
    commands,
    stashCommands,
    serviceInvocationCommands,
    vscode.commands.registerCommand("twls.showOutput", () => {
      logger.show();
    }),
    logger,
  );
}

export function deactivate(): void {}
