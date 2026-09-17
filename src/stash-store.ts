import * as vscode from "vscode";
import {
  StashEntry,
  stashEntrySchema,
  sortStashEntriesNewestFirst,
} from "./stash";

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
    const json = stashEntrySchema.parse(entry);
    const content = new TextEncoder().encode(JSON.stringify(json, null, 2));
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

  /**
   * Reads one stash entry. Returns `undefined` when the file is missing or its
   * contents are not valid JSON / a valid entry, so a single corrupted file
   * cannot break listing or "apply/pop latest".
   */
  async read(id: string): Promise<StashEntry | undefined> {
    let content: Uint8Array;

    try {
      content = await vscode.workspace.fs.readFile(this.entryUri(id));
    } catch (error) {
      if (error instanceof vscode.FileSystemError) {
        return undefined;
      }
      throw error;
    }

    let json: unknown;

    try {
      json = JSON.parse(new TextDecoder().decode(content));
    } catch {
      return undefined;
    }

    const parsed = stashEntrySchema.safeParse(json);
    return parsed.success ? parsed.data : undefined;
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
