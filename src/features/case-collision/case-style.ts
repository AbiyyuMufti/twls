/**
 * Classifies and ranks naming conventions so case-collision warnings can
 * tell the user which variant matches the team's PascalCase convention.
 */

export type CaseStyle = "PascalCase" | "camelCase" | "snake_case" | "other";

/** Lower index = higher priority. PascalCase wins; snake_case and unclassified names rank lowest. */
const PRIORITY_ORDER: readonly CaseStyle[] = [
  "PascalCase",
  "camelCase",
  "snake_case",
  "other",
];

export function classifyCaseStyle(name: string): CaseStyle {
  if (name.includes("_")) {
    return "snake_case";
  }
  if (/^[A-Z]/.test(name)) {
    return "PascalCase";
  }
  if (/^[a-z]/.test(name)) {
    return "camelCase";
  }
  return "other";
}

function priorityRank(style: CaseStyle): number {
  const rank = PRIORITY_ORDER.indexOf(style);
  return rank === -1 ? PRIORITY_ORDER.length : rank;
}

/**
 * Picks the team-preferred member of a collision group: PascalCase first,
 * then camelCase, then snake_case/other, alphabetical as a final tiebreak
 * for determinism. Uses reduce (not index access) to stay
 * noUncheckedIndexedAccess-safe.
 */
export function pickPreferredName<T extends { name: string }>(
  members: readonly T[],
): T | undefined {
  return members.reduce<T | undefined>((best, candidate) => {
    if (!best) {
      return candidate;
    }

    const rankDiff =
      priorityRank(classifyCaseStyle(candidate.name)) -
      priorityRank(classifyCaseStyle(best.name));

    if (rankDiff < 0) {
      return candidate;
    }
    if (rankDiff > 0) {
      return best;
    }
    return candidate.name < best.name ? candidate : best;
  }, undefined);
}
