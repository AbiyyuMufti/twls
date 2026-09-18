import z from "zod";

/**
 * One row from a SpotlightSearchV2 Thing search (Things implementing a given
 * ThingShape or ThingTemplate). Verified fields: `name`, `type`. The server
 * likely returns more (permissions, tags, etc.) — preserved via
 * `looseObject` but not modeled since nothing needs them yet.
 */
export const thingSearchRowSchema = z.looseObject({
  name: z.string(),
  type: z.string(),
});

export type ThingSearchRow = z.infer<typeof thingSearchRowSchema>;

export const thingSearchResponseSchema = z.object({
  rows: thingSearchRowSchema.array(),
});
