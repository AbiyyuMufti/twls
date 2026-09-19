import { Config } from "../../config";
import { Entity, EntityMeta, entityMap } from "../entity/entity";
import { ProjectMeta } from "../entity/project";
import { searchEntityMeta } from "./search";
import { thingworxFetch } from "./client";

/** Downloads and parses a single entity from ThingWorx. */
export async function fetchEntity(
  config: Config,
  entityMeta: EntityMeta,
): Promise<Entity> {
  const source = await thingworxFetch(config, {
    method: "GET",
    endpoint: `/Thingworx/${entityMeta.parentType}/${entityMeta.name}`,
  });

  return new entityMap[entityMeta.type](entityMeta, source);
}

/** Downloads every entity in the given project (or nothing when omitted). */
export async function fetchProjectEntity(
  config: Config,
  projectMeta?: ProjectMeta,
): Promise<Entity[] | undefined> {
  if (!projectMeta) {
    return;
  }

  const entityMeta = await searchEntityMeta(config, "*", projectMeta);
  const entities = entityMeta.map((entity) => fetchEntity(config, entity));

  return Promise.all(entities);
}

/** Pushes a whole entity definition back to ThingWorx with an optional comment. */
export async function updateEntity(
  config: Config,
  entity: Entity,
  comment: string,
): Promise<void> {
  let endpoint = `/Thingworx/${entity.meta.parentType}/${entity.meta.name}`;

  if (comment) {
    endpoint += `?reason=${comment}`;
  }

  await thingworxFetch(config, {
    method: "PUT",
    endpoint,
    body: entity.getSource(),
  });
}
