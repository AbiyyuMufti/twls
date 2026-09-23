import * as vscode from "vscode";
import { CommandRunner } from "../../command-runner";

interface ExecuteCommandMessage {
  type: "executeCommand";
  command: string;
  args?: unknown[];
}

interface GetServicesMessage {
  type: "getServices";
}

type SidebarMessage = ExecuteCommandMessage | GetServicesMessage;

export class SidebarView implements vscode.WebviewViewProvider {
  public static readonly viewType = "twls.sidebar";

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly runner: CommandRunner,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "dist", "webview"),
      ],
    };

    webviewView.webview.onDidReceiveMessage(async (message: SidebarMessage) => {
      if (message.type === "getServices") {
        await this.sendServices(webviewView.webview);
        return;
      }

      if (message.type !== "executeCommand") {
        return;
      }

      try {
        await vscode.commands.executeCommand(
          message.command,
          ...(message.args ?? []),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        void vscode.window.showErrorMessage(`TWLS command failed: ${message}`);
      }
    });

    webviewView.webview.html = this.buildHtml(webviewView.webview);
  }

  private buildHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "sidebar.js"),
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "sidebar.css"),
    );

    const nonce = String(Date.now());

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />

        <meta
          http-equiv="Content-Security-Policy"
          content="
            default-src 'none';
            style-src ${webview.cspSource};
            script-src 'nonce-${nonce}';
          "
        />

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />

        <link rel="stylesheet" href="${styleUri.toString()}" />

        <title>TWLS</title>
      </head>

      <body>
        <div id="root"></div>

        <script
          type="module"
          nonce="${nonce}"
          src="${scriptUri.toString()}"
        ></script>
      </body>
      </html>`;
  }

  private async sendServices(webview: vscode.Webview): Promise<void> {
    const repo = await this.runner.resolveRepository();

    if (!repo) {
      return;
    }

    const services = repo.entity.getServices();

    await webview.postMessage({
      type: "services",
      services: services
        .map((service) => ({
          name: service.name,
          description: service.extension,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  }
}
