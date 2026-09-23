import * as vscode from "vscode";

export class SidebarView implements vscode.WebviewViewProvider {
  public static readonly viewType = "twls.sidebar";

  constructor(private extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "dist", "webview"),
      ],
    };
    const scriptUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "sidebar.js"),
    );
    const nonce = String(Date.now());
    webviewView.webview.html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta
          http-equiv="Content-Security-Policy"
          content="default-src 'none'; script-src 'nonce-${nonce}';"
        />
      </head>
      <body>
        <div id="root"></div>
        <script
          type="module"
          nonce="${nonce}"
          src="${scriptUri.toString()}"
        ></script>
      </body>
      </html>
    `;
    // webviewView.webview.options = {
    //   enableScripts: true,
    // };

    // webviewView.webview.html = `
    //   <!DOCTYPE html>
    //   <html>
    //   <body>
    //     <h2>TWLS</h2>
    //     <p>Hello World!</p>
    //   </body>
    //   </html>
    // `;
  }
}
