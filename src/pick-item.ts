import type { EntityMeta, ProjectMeta } from "./thingworx";

export type MetaPickItem<TMeta> = TMeta & {
  label: string;
  description: string;
  detail: string;
};

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
