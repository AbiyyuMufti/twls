import type { ArtifactKind } from "./artifact-path";

/** One artifact captured by a stash entry: enough to restore or re-delete it later. */
export interface StashedFile {
  relativePath: string[];
  kind: ArtifactKind;
  /** True when the artifact was locally deleted (vs. locally edited). */
  deleted: boolean;
  /** Local file content at stash time. Empty string when `deleted` is true. */
  content: string;
}

export interface StashEntry {
  id: string;
  entityName: string;
  createdAt: string;
  files: StashedFile[];
}

let sequence = 0;

/**
 * Builds a new stash entry with a monotonically increasing id (timestamp +
 * sequence, so ids created in the same millisecond still sort correctly).
 */
export function createStashEntry(
  entityName: string,
  files: StashedFile[],
): StashEntry {
  const now = new Date();
  sequence += 1;
  const id = `${now.getTime()}-${sequence.toString().padStart(6, "0")}`;

  return {
    id,
    entityName,
    createdAt: now.toISOString(),
    files,
  };
}

/** Sorts stash entries newest-first. */
export function sortStashEntriesNewestFirst(
  entries: StashEntry[],
): StashEntry[] {
  return [...entries].sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}
