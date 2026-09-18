import z from "zod";
import { Config } from "../../config";
import { EntityMeta, entityMetaSchema } from "../entity/entity";
import { ProjectMeta, projectMetaSchema } from "../entity/project";
import { thingworxFetch } from "./client";
/**
 * Searches ThingWorx (SpotlightSearchV2) for entities matching the expression,
 * optionally constrained to a single project.
 */
export async function searchEntityMeta(
  config: Config,
  searchExpression: string,
  projectMeta?: ProjectMeta,
): Promise<EntityMeta[]> {
  const MAX_ITEMS = 200;
  const MAX_SEARCH_ITEMS = 100_000;

  const result = await thingworxFetch(config, {
    method: "POST",
    endpoint: "/Thingworx/Resources/SearchFunctions/Services/SpotlightSearchV2",
    body: {
      aspects: {
        isEditableExtensionObject: false,
        isEditableSystemObject: false,
        isExtension: false,
        isSystemObject: false,
      },
      isAscending: true,
      maxItems: MAX_ITEMS,
      maxSearchItems: MAX_SEARCH_ITEMS,
      searchDescriptions: false,
      searchExpression: searchExpression,
      sortBy: "name",
      tags: [],
      types: {
        items: entityMetaSchema.shape.type.options,
      },
      withPermissions: false,
      projectName: projectMeta?.name,
    },
  });

  const parsed = z
    .object({
      rows: entityMetaSchema.array(),
    })
    .parse(result);
  return parsed.rows;
}

/** Searches ThingWorx (SpotlightSearchV2) for projects matching the expression. */
export async function searchProjectMeta(
  config: Config,
  searchExpression: string,
): Promise<ProjectMeta[]> {
  const MAX_ITEMS = 200;
  const MAX_SEARCH_ITEMS = 100_000;

  const result = await thingworxFetch(config, {
    method: "POST",
    endpoint: "/Thingworx/Resources/SearchFunctions/Services/SpotlightSearchV2",
    body: {
      aspects: {
        isEditableExtensionObject: false,
        isEditableSystemObject: false,
        isExtension: false,
        isSystemObject: false,
      },
      isAscending: true,
      maxItems: MAX_ITEMS,
      maxSearchItems: MAX_SEARCH_ITEMS,
      searchDescriptions: false,
      searchExpression: searchExpression,
      sortBy: "name",
      tags: [],
      types: {
        items: projectMetaSchema.shape.type.options,
      },
      withPermissions: false,
    },
  });

  const parsed = z
    .object({
      rows: projectMetaSchema.array(),
    })
    .parse(result);
  return parsed.rows;
}
