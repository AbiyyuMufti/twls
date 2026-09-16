import z from "zod";
import { ThingShape } from "./thing-shape";
import { ThingTemplate } from "./thing-template";
import type { ServiceDefinition } from "./zod-service-definition";

/**
 * Generic entity domain model: identity (`EntityMeta`), the artifact shapes
 * every entity exposes (`Service`, `Subscription`), and the `Entity`
 * interface itself. No REST/network concerns live here — that's
 * `thingworx.ts`'s responsibility. Per-entity-type parsing (ThingShape,
 * ThingTemplate, ...) lives under `entity/`.
 */

/** Maps each entity type to the REST collection ("parent type") it lives under. */
const entityParentTypes = {
  ThingShape: "ThingShapes",
  ThingTemplate: "ThingTemplates",
} as const;

const entityTypes = Object.keys(entityParentTypes) as unknown as readonly [
  keyof typeof entityParentTypes,
];

const parentTypes = Object.values(entityParentTypes) as unknown as readonly [
  (typeof entityParentTypes)[keyof typeof entityParentTypes],
];

/**
 * Uniquely identifies a ThingWorx entity. `type` is the entity kind
 * (`ThingShape`/`ThingTemplate`) and `parentType` is the REST collection it is
 * stored under (`ThingShapes`/`ThingTemplates`).
 */
export const entityMetaSchema = z.object({
  name: z.string(),
  projectName: z.string(),
  type: z.enum(entityTypes),
  parentType: z.enum(parentTypes),
});

export type EntityMeta = z.infer<typeof entityMetaSchema>;

/** A single callable service: its name, source code, and file extension. */
export const localServiceSchema = z.object({
  name: z.string(),
  source: z.string(),
  extension: z.enum([".js", ".sql"]),
});

export const localSubscriptionSchema = z.object({
  name: z.string(),
  source: z.string(),
  extension: z.enum([".js"]),
});

export type Service = z.infer<typeof localServiceSchema>;
export type Subscription = z.infer<typeof localSubscriptionSchema>;

/** Glob for watching all service files (`.js` and `.sql`) under a root. */
export function getServiceExtensionPattern(): string {
  const s = localServiceSchema.shape.extension.options
    .map((ext) => ext.slice(1))
    .join(",");
  return `**/*.{${s}}`;
}

/** Glob for watching all subscription files (`.js`) under a root. */
export function getSubscriptionExtensionPattern(): string {
  const s = localSubscriptionSchema.shape.extension.options
    .map((ext) => ext.slice(1))
    .join(",");
  return `**/*.{${s}}`;
}

/**
 * Uniform view over a fetched ThingWorx entity: its identity, the raw JSON it
 * was parsed from, and its services and subscriptions. `getSource()` returns
 * the raw JSON so it can be persisted or PUT back to the server.
 */
export interface Entity {
  meta: EntityMeta;
  getSource(): unknown;
  getLastModifiedDate(): number;
  getServices(): Service[];
  getSubscriptions(): Subscription[];
  getServiceDefinition(name: string): ServiceDefinition | undefined;
  updateService(name: string, source: string): void;
  updateSubscription(name: string, source: string): void;
}

/** Constructs the right entity class for each {@link EntityMeta.type}. */
export const entityMap = {
  ThingShape: ThingShape,
  ThingTemplate: ThingTemplate,
} satisfies Record<
  EntityMeta["type"],
  new (meta: EntityMeta, source: unknown) => Entity
>;
