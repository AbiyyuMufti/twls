import path from "node:path";
import * as vscode from "vscode";
import { Config } from "./config";
import { REMOTE_SCHEME, RemoteTextDocumentContentProvider } from "./remote";
import { Repository } from "./repository";

export class Model implements vscode.Disposable {
  private repositories = new Map<string, Repository>();
  private configWatcher: vscode.FileSystemWatcher;
  private remote: RemoteTextDocumentContentProvider;
  private disposables: vscode.Disposable[] = [];

  constructor(
    context: vscode.ExtensionContext,
    folders: readonly vscode.WorkspaceFolder[] | undefined,
  ) {
    folders?.forEach((folder) => {
      this.addRepository(folder.uri).catch((error) => {
        console.error(error);
      });
    });

    this.configWatcher = vscode.workspace.createFileSystemWatcher(
      Config.globPattern,
    );
    this.configWatcher.onDidCreate((e) => {
      this.addRepository(Config.getRootUri(e)).catch((error) => {
        console.error(error);
      });
    });
    this.configWatcher.onDidChange((e) => {
      this.addRepository(Config.getRootUri(e)).catch((error) => {
        console.error(error);
      });
    });
    this.configWatcher.onDidDelete((e) => {
      this.removeRepository(Config.getRootUri(e));
    });
    this.disposables.push(this.configWatcher);

    this.remote = new RemoteTextDocumentContentProvider(
      context.globalStorageUri,
    );
    this.disposables.push(
      vscode.workspace.registerTextDocumentContentProvider(
        REMOTE_SCHEME,
        this.remote,
      ),
    );
  }

  dispose(): void {
    this.repositories.forEach((repo) => {
      repo.dispose();
    });
    this.repositories.clear();

    this.disposables.forEach((disposable) => {
      disposable.dispose();
    });
  }

  getRepository(rootUri: vscode.Uri): Repository | undefined {
    const key = rootUri.toString();
    return this.repositories.get(key);
  }

  async showRepositoryPick(
    options: Pick<vscode.QuickPickOptions, "placeHolder" | "ignoreFocusOut">,
  ): Promise<Repository | undefined> {
    const items = Array.from(this.repositories.keys()).map((key) => {
      const item = {
        label: path.basename(key),
        key,
      };
      return item satisfies vscode.QuickPickItem;
    });
    const selected = await vscode.window.showQuickPick(items, options);

    if (!selected) {
      return;
    }

    return this.repositories.get(selected.key);
  }

  private async addRepository(rootUri: vscode.Uri): Promise<void> {
    let config: Config | undefined;

    try {
      config = await Config.load(rootUri);
    } catch (error) {
      if (error instanceof vscode.FileSystemError) {
        return;
      }

      throw error;
    }

    const key = rootUri.toString();
    let repo = this.repositories.get(key);

    if (repo) {
      repo.dispose();
      this.repositories.delete(key);
    }

    repo = await Repository.init(rootUri, config);

    if (!repo) {
      return;
    }

    this.remote.updated(config, repo.entity);
    repo.onEntityChange((entity) => {
      this.remote.updated(config, entity);
    });
    this.repositories.set(key, repo);

    console.log(
      `[Model][addRepository] Repository added: ${rootUri.toString()}`,
    );
  }

  private removeRepository(rootUri: vscode.Uri): void {
    const key = rootUri.toString();
    const repo = this.repositories.get(key);

    if (repo) {
      repo.dispose();
      this.repositories.delete(key);
    }

    console.log(
      `[Model][removeRepository] Repository removed: ${rootUri.toString()}`,
    );
  }
}
