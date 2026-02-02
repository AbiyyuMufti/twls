import * as vscode from "vscode";
import z from "zod";

export function activate(context: vscode.ExtensionContext): void {
  const model = new Model(vscode.workspace.workspaceFolders);
  const commands = new Commands();
  context.subscriptions.push(model, commands);
}

export function deactivate(): void {}

class Model implements vscode.Disposable {
  private repositories = new Map<string, Repository>();
  private configWatcher;

  constructor(folders: readonly vscode.WorkspaceFolder[] | undefined) {
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
  }

  dispose(): void {
    this.repositories.clear();

    this.configWatcher.dispose();
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
      this.repositories.delete(key);
    }

    repo = new Repository(config);
    this.repositories.set(key, repo);

    console.log(
      `[Model][addRepository] Repository added: ${rootUri.toString()}`,
    );
  }

  private removeRepository(rootUri: vscode.Uri): void {
    const key = rootUri.toString();
    this.repositories.delete(key);

    console.log(
      `[Model][removeRepository] Repository removed: ${rootUri.toString()}`,
    );
  }
}

class Repository {
  constructor(private config: Config) {}

  pull(): void {
    throw new Error("Method not implemented.");
  }

  push(): void {
    throw new Error("Method not implemented.");
  }
}

class Config {
  private static FOLDER_NAME = ".twls";
  private static THINGWORX_FILE_NAME = "thingworx.json";

  private static thingworxSchema = z.object({
    baseUrl: z.url(),
    appKey: z.guid(),
  });

  constructor(
    private rootUri: vscode.Uri,
    public baseUrl: string,
    public appKey: string,
  ) {}

  static get globPattern(): vscode.GlobPattern {
    return `**/${this.FOLDER_NAME}/${this.THINGWORX_FILE_NAME}`;
  }

  static getRootUri(thingworxUri: vscode.Uri): vscode.Uri {
    return vscode.Uri.joinPath(thingworxUri, "..", "..");
  }

  static async load(rootUri: vscode.Uri): Promise<Config> {
    const content = await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(
        rootUri,
        Config.FOLDER_NAME,
        Config.THINGWORX_FILE_NAME,
      ),
    );
    const json = JSON.parse(new TextDecoder().decode(content)) as unknown;
    const parsed = this.thingworxSchema.parse(json);
    return new Config(rootUri, parsed.baseUrl, parsed.appKey);
  }

  async save(): Promise<void> {
    const json = Config.thingworxSchema.parse({
      baseUrl: this.baseUrl,
      appKey: this.appKey,
    });
    const content = new TextEncoder().encode(JSON.stringify(json, null, 2));
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(
        this.rootUri,
        Config.FOLDER_NAME,
        Config.THINGWORX_FILE_NAME,
      ),
      content,
    );
  }
}

class Commands implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.disposables.push(
      vscode.commands.registerCommand("twls.init", () => {
        this.init().catch((error) => {
          console.error(error);
        });
      }),
    );
  }

  async init(): Promise<void> {
    const folder = await vscode.window.showWorkspaceFolderPick({
      placeHolder: "Pick workspace",
      ignoreFocusOut: true,
    });

    if (!folder) {
      return;
    }

    const baseUrl = await vscode.window.showInputBox({
      prompt: "Enter ThingWorx Base URL",
      placeHolder: "e.g. http://localhost:8080",
      ignoreFocusOut: true,
    });

    if (!baseUrl) {
      return;
    }

    const appKey = await vscode.window.showInputBox({
      prompt: "Enter ThingWorx Application Key",
      ignoreFocusOut: true,
    });

    if (!appKey) {
      return;
    }

    const config = new Config(folder.uri, baseUrl, appKey);
    await config.save();

    await vscode.window.showInformationMessage(
      "TWLS initialized successfully.",
    );
  }

  dispose(): void {
    this.disposables.forEach((disposable) => {
      disposable.dispose();
    });
  }
}
