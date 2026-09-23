import * as vscode from "vscode";
import { ServiceInvocationViewModel } from "../../../shared/service-invocation-result";

/**
 * Owns the single webview panel used to show service invocation results.
 * Reused (revealed, not recreated) so repeated calls don't pile up panels.
 */
export class ResultPanel {
  private static current: ResultPanel | undefined;
  private panel: vscode.WebviewPanel;
  private ready = false;
  private pendingContent: ServiceInvocationViewModel | undefined;

  private constructor(private extensionUri: vscode.Uri) {
    this.panel = vscode.window.createWebviewPanel(
      "twls.result",
      "TWLS Result",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "dist", "webview"),
        ],
      },
    );
    this.panel.onDidDispose(() => {
      ResultPanel.current = undefined;
    });
    this.panel.webview.onDidReceiveMessage((message: { type?: string }) => {
      if (message?.type === "ready") {
        this.ready = true;
        if (this.pendingContent !== undefined) {
          this.post(this.pendingContent);
          this.pendingContent = undefined;
        }
      }
    });
    this.panel.webview.html = this.buildHtml();
  }

  static show(
    extensionUri: vscode.Uri,
    content: ServiceInvocationViewModel,
  ): void {
    if (!ResultPanel.current) {
      ResultPanel.current = new ResultPanel(extensionUri);
    }

    ResultPanel.current.panel.reveal(vscode.ViewColumn.Beside, true);
    ResultPanel.current.setContent(content);
  }

  private post(content: ServiceInvocationViewModel): void {
    void this.panel.webview.postMessage({ type: "result", content });
  }

  private setContent(content: ServiceInvocationViewModel): void {
    if (this.ready) {
      this.post(content);
    } else {
      this.pendingContent = content;
    }
  }

  private buildHtml(): string {
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "dist",
        "webview",
        "result-panel.js",
      ),
    );
    const nonce = String(Date.now());

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
      <meta charset="UTF-8" />
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}';" />
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
}
