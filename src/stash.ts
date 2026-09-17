import z from "zod";

/**
 * Validates a stash id against the exact shape {@link createStashEntry}
 * generates: `<timestamp>-<sequence>`, where the timestamp is `Date.getTime()`
 * (a non-negative integer, no leading zeros) and the sequence is
 * `padStart(6, "0")` (at least six digits, zero-padded). Rejecting anything
 * else stops a crafted id such as `../../thingworx` from escaping the
 * `.twls/stash` folder.
 */
export const stashIdSchema = z
  .string()
  .regex(/^(?:0|[1-9][0-9]*)-[0-9]{6,}$/);

/**
 * A path segment is safe only when it names a single, non-relative path
 * component, so joining it onto the workspace root cannot escape it.
 */
function isSafePathSegment(segment: string): boolean {
  return (
    segment !== "" &&
    segment !== "." &&
    segment !== ".." &&
    !segment.includes("/") &&
    !segment.includes("\\")
  );
}

/**
 * One artifact captured by a stash entry: enough to restore or re-delete it
 * later.
 */
const stashedFileSchema = z.object({
  relativePath: z.array(z.string()).refine(
    (segments) => segments.length > 0 && segments.every(isSafePathSegment),
    "path segments must be non-empty and must not be relative or contain separators",
  ),
  kind: z.enum(["service", "subscription"]),
  /** True when the artifact was locally deleted (vs. locally edited). */
  deleted: z.boolean(),
  /** Local file content at stash time. Empty string when `deleted` is true. */
  content: z.string(),
});

/**
 * Validates the on-disk shape of a stash entry. Used when reading so a
 * corrupted `.twls/stash/<id>.json` is skipped instead of aborting the list.
 */
export const stashEntrySchema = z.object({
  id: stashIdSchema,
  entityName: z.string(),
  createdAt: z.string(),
  files: z.array(stashedFileSchema),
});

export type StashedFile = z.infer<typeof stashedFileSchema>;
export type StashEntry = z.infer<typeof stashEntrySchema>;

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
