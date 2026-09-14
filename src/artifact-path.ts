import type { EntityMeta } from "./thingworx";

export type ArtifactKind = "service" | "subscription";

const artifactFolderName: Record<ArtifactKind, string> = {
  service: "services",
  subscription: "subscriptions",
};

/**
 * Builds the relative path segments for a local artifact file:
 * `<project>/<entity>/<services|subscriptions>/<name><extension>`.
 *
 * Returned as segments (not a joined string) so callers can pass them
 * straight into `vscode.Uri.joinPath(rootUri, ...segments)`.
 */
export function buildArtifactRelativePath(
  entityMeta: Pick<EntityMeta, "projectName" | "name">,
  kind: ArtifactKind,
  artifactName: string,
  extension: string,
): string[] {
  return [
    entityMeta.projectName,
    entityMeta.name,
    artifactFolderName[kind],
    artifactName + extension,
  ];
}
