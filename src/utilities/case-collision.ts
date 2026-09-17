/**
 * Detects and resolves artifact names that only differ by letter case —
 * these collide into a single file on case-insensitive filesystems
 * (Windows/NTFS, default macOS/APFS), e.g. `InsertFGFromSAP` and
 * `insertFGFromSAP`.
 */

import { pickPreferredName } from "./case-style";

export interface CaseDedupeResult<T> {
  kept: T[];
  dropped: T[];
}

interface NamedArtifact {
  name: string;
  extension: string;
}

/** A set of artifacts whose filename collides case-insensitively. */
export interface CaseCollisionGroup<T> {
  /** Lowercased "name+extension" these artifacts collide on. */
  key: string;
  members: T[];
}

/**
 * Groups artifacts whose on-disk filename would collide on a
 * case-insensitive filesystem. Artifacts sharing the exact same name are
 * not a collision — that's a real duplicate, handled elsewhere.
 */
export function findCaseCollisions<T extends NamedArtifact>(
  artifacts: readonly T[],
): CaseCollisionGroup<T>[] {
  const groups = new Map<string, T[]>();

  for (const artifact of artifacts) {
    const key = (artifact.name + artifact.extension).toLowerCase();
    const existing = groups.get(key);

    if (existing) {
      existing.push(artifact);
    } else {
      groups.set(key, [artifact]);
    }
  }

  const collisions: CaseCollisionGroup<T>[] = [];

  for (const [key, members] of groups) {
    const distinctNames = new Set(members.map((member) => member.name));
    if (distinctNames.size > 1) {
      collisions.push({ key, members });
    }
  }

  return collisions;
}

/**
 * Deterministic case-safe filenames for a collision group: sorted by exact
 * name so the result is stable across re-pulls rather than depending on
 * write order. The first member (alphabetically) keeps its plain name; the
 * rest get a `.dupN` suffix before the extension.
 */
export function resolveCaseSafeNames<T extends NamedArtifact>(
  group: CaseCollisionGroup<T>,
): Map<T, string> {
  const sorted = [...group.members].sort((a, b): number => {
    if (a.name < b.name) {
      return -1;
    }
    if (a.name > b.name) {
      return 1;
    }
    return 0;
  });

  const result = new Map<T, string>();

  sorted.forEach((member, index) => {
    const suffix = index === 0 ? "" : `.dup${index}`;
    result.set(member, member.name + suffix + member.extension);
  });

  return result;
}

/** Thrown when the user declines to resolve a case collision on write. */
export class CaseCollisionCancelledError extends Error {
  constructor(summary: string) {
    super(
      `Operation cancelled: case-sensitivity collision not resolved (${summary}).`,
    );
    this.name = "CaseCollisionCancelledError";
  }
}

/** Human-readable "A / B" summary of a collision group's member names. */
export function describeCaseCollisionGroup<T extends NamedArtifact>(
  group: CaseCollisionGroup<T>,
): string {
  return group.members.map((member) => member.name).join(" / ");
}

/**
 * Groups artifacts purely by case-insensitive name, ignoring extension.
 * Used to merge collision warnings that span multiple file types (code +
 * `.yaml` definition) sharing the same logical name clash.
 */
export function groupByCaseInsensitiveName<T extends { name: string }>(
  artifacts: readonly T[],
): CaseCollisionGroup<T>[] {
  const groups = new Map<string, T[]>();

  for (const artifact of artifacts) {
    const key = artifact.name.toLowerCase();
    const existing = groups.get(key);

    if (existing) {
      existing.push(artifact);
    } else {
      groups.set(key, [artifact]);
    }
  }

  const collisions: CaseCollisionGroup<T>[] = [];

  for (const [key, members] of groups) {
    const distinctNames = new Set(members.map((member) => member.name));
    if (distinctNames.size > 1) {
      collisions.push({ key, members });
    }
  }

  return collisions;
}

/**
 * Filters artifacts down to one per case-insensitive name, keeping the
 * team's preferred (PascalCase) variant and dropping the rest before they
 * ever reach disk — so a collision can no longer occur, race or no race.
 * Non-colliding artifacts pass through unchanged.
 */
export function dedupeByPreferredCase<T extends { name: string }>(
  artifacts: readonly T[],
): CaseDedupeResult<T> {
  const groups = groupByCaseInsensitiveName(artifacts);
  const droppedSet = new Set<T>();

  for (const group of groups) {
    const preferred = pickPreferredName(group.members);

    if (!preferred) {
      continue; // groups are always non-empty; defensive only
    }

    for (const member of group.members) {
      if (member !== preferred) {
        droppedSet.add(member);
      }
    }
  }

  const kept: T[] = [];
  const dropped: T[] = [];

  for (const artifact of artifacts) {
    if (droppedSet.has(artifact)) {
      dropped.push(artifact);
    } else {
      kept.push(artifact);
    }
  }

  return { kept, dropped };
}
