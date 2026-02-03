import * as vscode from "vscode";
import z from "zod";

export class Config {
  private static FOLDER_NAME = ".twls";
  private static THINGWORX_FILE_NAME = "thingworx.json";

  private static thingworxSchema = z.object({
    baseUrl: z.url(),
    appKey: z.guid(),
    entityName: z.string(),
  });

  constructor(
    private rootUri: vscode.Uri,
    public baseUrl: string,
    public appKey: string,
    public entityName: string,
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
    return new Config(
      rootUri,
      parsed.baseUrl,
      parsed.appKey,
      parsed.entityName,
    );
  }

  async save(): Promise<void> {
    const json = Config.thingworxSchema.parse({
      baseUrl: this.baseUrl,
      appKey: this.appKey,
      entityName: this.entityName,
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
