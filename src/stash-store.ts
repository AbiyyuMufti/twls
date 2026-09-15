import * as vscode from "vscode";
import { StashEntry, sortStashEntriesNewestFirst } from "./stash";

/**
 * On-disk stash storage for one repository. Entries live as
 * `.twls/stash/<id>.json`, one file per stash, so they survive across VS Code
 * sessions the same way git stashes do.
 */
export class StashStore {
  private static FOLDER_NAME = "stash";

  constructor(private rootUri: vscode.Uri) {}

  private get folderUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.rootUri, ".twls", StashStore.FOLDER_NAME);
  }

  private entryUri(id: string): vscode.Uri {
    return vscode.Uri.joinPath(this.folderUri, `${id}.json`);
  }

  async save(entry: StashEntry): Promise<void> {
    const content = new TextEncoder().encode(JSON.stringify(entry, null, 2));
    await vscode.workspace.fs.writeFile(this.entryUri(entry.id), content);
  }

  /** Lists all stash entries for this repository, newest first. */
  async list(): Promise<StashEntry[]> {
    let files: [string, vscode.FileType][];

    try {
      files = await vscode.workspace.fs.readDirectory(this.folderUri);
    } catch (error) {
      if (error instanceof vscode.FileSystemError) {
        return [];
      }
      throw error;
    }

    const entries = await Promise.all(
      files
        .filter(
          ([name, type]) =>
            type === vscode.FileType.File && name.endsWith(".json"),
        )
        .map(([name]) => this.read(name.slice(0, -".json".length))),
    );

    return sortStashEntriesNewestFirst(
      entries.filter((entry): entry is StashEntry => entry !== undefined),
    );
  }

  async read(id: string): Promise<StashEntry | undefined> {
    try {
      const content = await vscode.workspace.fs.readFile(this.entryUri(id));
      return JSON.parse(new TextDecoder().decode(content)) as StashEntry;
    } catch (error) {
      if (error instanceof vscode.FileSystemError) {
        return undefined;
      }
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await vscode.workspace.fs.delete(this.entryUri(id));
    } catch (error) {
      if (!(error instanceof vscode.FileSystemError)) {
        throw error;
      }
    }
  }
}
