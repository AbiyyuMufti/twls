import { Config } from "./config";
import { EntityMeta } from "./core/entity/entity";
import {
  ThingSearchRow,
  thingSearchResponseSchema,
} from "./entity/zod-thing-search";
import { thingworxFetch } from "./core/thingworx/client";





export type ServiceInvocationResult = {
  status: number;
  statusText: string;
  ok: boolean;
  rawBody: string;
  jsonBody: unknown;
};

export async function invokeThingService(
  config: Config,
  thingName: string,
  serviceName: string,
  params: Record<string, unknown>,
): Promise<ServiceInvocationResult> {
  const url = new URL(
    `/Thingworx/Things/${thingName}/Services/${serviceName}`,
    config.baseUrl,
  );

  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        appKey: config.appKey,
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-thingworx-session": "false",
      },
      body: JSON.stringify(params),
    });
  } catch (error) {
    throw new Error(
      `ThingWorx network error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const rawBody = await response.text();

  let jsonBody: unknown;
  try {
    jsonBody = rawBody ? JSON.parse(rawBody) : undefined;
  } catch {
    jsonBody = undefined;
  }

  return {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    rawBody,
    jsonBody,
  };
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