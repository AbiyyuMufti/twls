import type { EntityMeta } from "./entity/entity";

export type ArtifactKind = "service" | "subscription";

const artifactFolderName: Record<ArtifactKind, string> = {
  service: "services",
  subscription: "subscriptions",
};

/** Relative path segments for the folder an artifact kind lives in: `<project>/<entity>/<services|subscriptions>`. */
export function buildArtifactFolderRelativePath(
  entityMeta: Pick<EntityMeta, "projectName" | "name">,
  kind: ArtifactKind,
): string[] {
  return [entityMeta.projectName, entityMeta.name, artifactFolderName[kind]];
}

/** Relative path segments for a specific artifact file. */
export function buildArtifactRelativePath(
  entityMeta: Pick<EntityMeta, "projectName" | "name">,
  kind: ArtifactKind,
  artifactName: string,
  extension: string,
): string[] {
  return [
    ...buildArtifactFolderRelativePath(entityMeta, kind),
    artifactName + extension,
  ];
}
