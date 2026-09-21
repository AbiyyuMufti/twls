import type { EntityMeta } from "../../core/entity/entity";
import type { ProjectMeta } from "../../core/entity/project";

/** A QuickPick item that carries an entity/project's metadata for later use. */
export type MetaPickItem<TMeta> = TMeta & {
  label: string;
  description: string;
  detail: string;
};

/**
 * Builds a pick item for an entity, or `undefined` when the entity is the one
 * currently active (so it never shows up as a switch target).
 */
export function buildEntityPickItem(
  meta: EntityMeta,
  currentEntityName: string,
): MetaPickItem<EntityMeta> | undefined {
  if (meta.name === currentEntityName) {
    return undefined;
  }

  return {
    ...meta,
    label: meta.name,
    description: meta.type,
    detail: meta.projectName,
  };
}

export function buildProjectPickItem(
  meta: ProjectMeta,
): MetaPickItem<ProjectMeta> {
  return {
    ...meta,
    label: meta.name,
    description: meta.type,
    detail: meta.projectName,
  };
}
