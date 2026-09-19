import z from "zod";
import { scriptServiceImplementationSchema } from "./service-implementation-schema";

/** Local on-disk subscription artifact shape. */
export const localSubscriptionSchema = z.object({
  name: z.string(),
  source: z.string(),
  extension: z.enum([".js"]),
});

export type Subscription = z.infer<typeof localSubscriptionSchema>;

/** Remote ThingWorx subscription shape. */
export const eventSchema = z.looseObject({
  sourceType: z.string(),
  alertName: z.string(),
  sourceProperty: z.string(),
  eventName: z.string(),
  alias: z.string(),
  source: z.string(),
  trigger: z.string(),
});

export const subscriptionsSchema = z.record(
  z.string(),
  z.looseObject({
    name: z.string(),
    events: z.array(eventSchema),
    serviceImplementation: scriptServiceImplementationSchema,
  }),
);

/** Glob for watching all subscription files (`.js`) under a root. */
export function getSubscriptionExtensionPattern(): string {
  const s = localSubscriptionSchema.shape.extension.options
    .map((ext) => ext.slice(1))
    .join(",");
  return `**/*.{${s}}`;
}
