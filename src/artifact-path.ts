import path from "node:path";
import type { Entity, EntityMeta } from "./entity/entity";

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

/** Maps a folder segment back to the artifact kind that lives in it. */
export function artifactKindFromFolderName(
  folderName: string,
): ArtifactKind | undefined {
  return (Object.keys(artifactFolderName) as ArtifactKind[]).find(
    (kind) => artifactFolderName[kind] === folderName,
  );
}

/** An artifact file decoded from a path: its kind, name, and extension. */
export type ParsedArtifactPath = {
  kind: ArtifactKind;
  name: string;
  extension: string;
};

/**
 * Decodes the trailing `<services|subscriptions>/<name><extension>` segments of
 * an artifact path. Accepts relative or absolute paths, POSIX or Windows.
 * Returns `undefined` when the path isn't an artifact file in a known folder.
 */
export function parseArtifactPath(
  filePath: string,
): ParsedArtifactPath | undefined {
  const segments = filePath.split(/[\\/]+/).filter((segment) => segment !== "");
  const filename = segments[segments.length - 1];
  const folderName = segments[segments.length - 2];

  if (!filename || !folderName) {
    return undefined;
  }

  const kind = artifactKindFromFolderName(folderName);

  if (!kind) {
    return undefined;
  }

  const extension = path.extname(filename);

  if (!extension) {
    return undefined;
  }

  return {
    kind,
    name: path.basename(filename, extension),
    extension,
  };
}

/**
 * Relative path segments for every artifact of an entity: services first, then
 * subscriptions. Used to enumerate the virtual remote documents to refresh.
 */
export function buildEntityArtifactRelativePaths(entity: Entity): string[][] {
  const services = entity
    .getServices()
    .map((service) =>
      buildArtifactRelativePath(
        entity.meta,
        "service",
        service.name,
        service.extension,
      ),
    );

  const subscriptions = entity
    .getSubscriptions()
    .map((subscription) =>
      buildArtifactRelativePath(
        entity.meta,
        "subscription",
        subscription.name,
        subscription.extension,
      ),
    );

  return [...services, ...subscriptions];
}
