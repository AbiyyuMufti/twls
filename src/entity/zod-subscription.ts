import z from "zod";
import { scriptServiceImplementationSchema } from "./zod-service-implementation";

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
