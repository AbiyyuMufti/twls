import * as vscode from "vscode";
import { Commands } from "./commands";
import { Model } from "./model";

export function activate(context: vscode.ExtensionContext): void {
  const model = new Model(vscode.workspace.workspaceFolders);
  const commands = new Commands();
  context.subscriptions.push(model, commands);
}

export function deactivate(): void {}
