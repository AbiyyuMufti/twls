import * as vscode from "vscode";
import { logger } from "../../logger";
import { EntityMeta } from "../../core/entity/entity";

export interface DroppedCaseArtifact {
  name: string;
  label: string; // "code file" | "definition" | "subscription"
}

/**
 * Logs and warns about artifacts that were never written because their name
 * only differs by letter case from another artifact that was kept instead
 * (team convention: PascalCase wins). No-op if nothing was dropped.
 */
export function warnDroppedCaseCollisions(
  entityMeta: EntityMeta,
  dropped: readonly DroppedCaseArtifact[],
): void {
  if (dropped.length === 0) {
    return;
  }

  const lines = dropped
    .map((artifact) => `${artifact.name} (${artifact.label})`)
    .join(", ");

  const message =
    `On ${entityMeta.name}, these names only differ by letter case from ` +
    `another artifact and were NOT written to disk — the team's PascalCase ` +
    `variant was kept instead: ${lines}.`;

  logger.warn(message);
  void vscode.window.showWarningMessage(message);
}
