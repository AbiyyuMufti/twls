import * as vscode from "vscode";
import { Commands } from "./commands";
import { logger } from "./logger";
import { Model } from "./model";
import { ServiceInvocationCommands } from "./service-invocation-commands";

export function activate(context: vscode.ExtensionContext): void {
  const model = new Model(context, vscode.workspace.workspaceFolders);
  const commands = new Commands(model);
  const serviceInvocationCommands = new ServiceInvocationCommands(model);
  context.subscriptions.push(
    model,
    commands,
    serviceInvocationCommands,
    logger,
  );
}

export function deactivate(): void {}
