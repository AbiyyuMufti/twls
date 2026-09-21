import z from "zod";
import { Config } from "../../config";
import { EntityMeta, entityMetaSchema } from "../entity/entity";
import { ProjectMeta, projectMetaSchema } from "../entity/project";
import { ThingSearchRow, thingSearchResponseSchema } from "../entity/thing-search";
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

const THING_TEMPLATES_EXCLUDED_WHEN_SEARCHING_BY_SHAPE = [
  "Timer",
  "Scheduler",
  "GenericConnector",
  "IndustrialGateway",
];

const THING_SHAPES_EXCLUDED_WHEN_SEARCHING_BY_TEMPLATE = [
  "Blog",
  "DataTable",
  "Stream",
  "ValueStream",
  "Wiki",
];

/**
 * Searches for Things implementing a given ThingShape or ThingTemplate via
 * SpotlightSearchV2. A shape/template can be implemented or inherited by any
 * number of Things (zero, one, or many) — this returns all matches; it's up
 * to the caller to decide what to do with more than one. Request shape
 * verified for both modes against real working calls; see
 * scripts/spotlight-search-v2.mjs.
 */
export async function searchThingsForEntity(
  config: Config,
  entityMeta: Pick<EntityMeta, "type" | "name">,
): Promise<ThingSearchRow[]> {
  const common = {
    searchExpression: "**",
    withPermissions: true,
    sortBy: "name",
    isAscending: true,
    searchDescriptions: true,
    includeInheritedThingShapes: true,
    types: { items: ["Thing"] },
    tags: [],
  };

  const body =
    entityMeta.type === "ThingShape"
      ? {
          ...common,
          thingTemplates: {
            excludedItems: THING_TEMPLATES_EXCLUDED_WHEN_SEARCHING_BY_SHAPE,
          },
          thingShapes: { excludedItems: null, items: [entityMeta.name] },
          entityContext: { type: "ThingShapes", name: entityMeta.name },
        }
      : {
          ...common,
          thingTemplates: { excludedItems: null, items: [entityMeta.name] },
          thingShapes: {
            excludedItems: THING_SHAPES_EXCLUDED_WHEN_SEARCHING_BY_TEMPLATE,
          },
          entityContext: { type: "ThingTemplates", name: entityMeta.name },
        };

  const result = await thingworxFetch(config, {
    method: "POST",
    endpoint: "/Thingworx/Resources/SearchFunctions/Services/SpotlightSearchV2",
    body,
  });

  return thingSearchResponseSchema.parse(result).rows;
}
