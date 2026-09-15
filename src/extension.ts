import * as vscode from "vscode";
import { Commands } from "./commands";
import { logger } from "./logger";
import { Model } from "./model";

export function activate(context: vscode.ExtensionContext): void {
  const model = new Model(context, vscode.workspace.workspaceFolders);
  const commands = new Commands(model);
  context.subscriptions.push(model, commands, logger);
}

export function deactivate(): void {}
