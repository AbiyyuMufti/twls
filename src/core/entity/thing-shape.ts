import z from "zod";
import { Entity, EntityMeta } from "./entity";
import { Service } from "./service-schema";
import {
  mergeServiceDefinition,
  ServiceDefinition,
  serviceDefinitionsSchema,
} from "./service-definition-schema";
import {
  buildScriptServiceImplementation,
  scriptServiceImplementationSchema,
} from "./service-implementation-schema";
import { Subscription, subscriptionsSchema } from "./subscription-schema";

/**
 * A ThingWorx thing shape. Its services and subscriptions are stored as
 * `Script` configuration tables, so each service and subscription maps to a
 * `.js` file. `serviceDefinitions` holds each service's parameter list and
 * result type, separate from the executable code in
 * `serviceImplementations`.
 */
export class ThingShape implements Entity {
  private readonly schema = z.looseObject({
    name: z.string(),
    lastModifiedDate: z.number(),
    serviceDefinitions: serviceDefinitionsSchema.default({}),
    serviceImplementations: z.record(
      z.string(),
      scriptServiceImplementationSchema,
    ),
    subscriptions: subscriptionsSchema.default({}),
  });

  private source: z.infer<typeof this.schema>;

  constructor(
    public meta: EntityMeta,
    source: unknown,
  ) {
    this.source = this.schema.parse(source);
  }

  getSource(): unknown {
    return this.source;
  }

  getLastModifiedDate(): number {
    return this.source.lastModifiedDate;
  }

  /** Returns one service per script implementation, read from the source. */
  getServices(): Service[] {
    const services: Service[] = [];

    for (const [serviceName, implementation] of Object.entries(
      this.source.serviceImplementations,
    )) {
      const row = implementation.configurationTables.Script.rows[0];

      if (!row) {
        throw new Error("Invalid source");
      }

      services.push({
        name: serviceName,
        source: row.code,
        extension: ".js",
      });
    }

    return services;
  }

  /** Returns one subscription per script implementation, read from the source. */
  getSubscriptions(): Subscription[] {
    const subscriptions: Subscription[] = [];

    for (const [subscriptionName, subscription] of Object.entries(
      this.source.subscriptions,
    )) {
      const row =
        subscription.serviceImplementation.configurationTables.Script.rows[0];

      if (!row) {
        throw new Error("Invalid source");
      }

      subscriptions.push({
        name: subscriptionName,
        source: row.code,
        extension: ".js",
      });
    }

    return subscriptions;
  }

  /** Looks up a service's parameter list and result type by name. */
  getServiceDefinition(name: string): ServiceDefinition | undefined {
    return this.source.serviceDefinitions[name];
  }

  /** ThingShape services are always Script-backed; there is no SQL query config. */
  getServiceQueryConfig(): { timeout: number; maxItems: number } | undefined {
    return undefined;
  }

  /** Replaces the code of an existing service in the in-memory source. */
  updateService(name: string, source: string): void {
    const implementation = this.source.serviceImplementations[name];

    if (!implementation) {
      throw new Error(
        `Service ${name} does not exist on entity ${this.source.name}`,
      );
    }

    const row = implementation.configurationTables.Script.rows[0];

    if (!row) {
      throw new Error("Invalid source");
    }

    row.code = source;
  }

  /** Replaces the code of an existing subscription in the in-memory source. */
  updateSubscription(name: string, source: string): void {
    const implementation =
      this.source.subscriptions[name]?.serviceImplementation;

    if (!implementation) {
      throw new Error(
        `Subscription ${name} does not exist on entity ${this.source.name}`,
      );
    }

    const row = implementation.configurationTables.Script.rows[0];

    if (!row) {
      throw new Error("Invalid source");
    }

    row.code = source;
  }

  /** Replaces an existing service's definition. queryConfig is accepted for interface symmetry but ignored — ThingShape has no SQL services. */
  updateServiceDefinition(name: string, definition: ServiceDefinition): void {
    const existing = this.source.serviceDefinitions[name];
    if (!existing) {
      throw new Error(
        `Service ${name} does not exist on entity ${this.source.name}`,
      );
    }

    this.source.serviceDefinitions[name] = mergeServiceDefinition(
      existing,
      definition,
    );
  }

  createService(
    name: string,
    definition: ServiceDefinition,
    source: string,
    extension: ".js" | ".sql",
  ): void {
    if (
      this.source.serviceDefinitions[name] ||
      this.source.serviceImplementations[name]
    ) {
      throw new Error(
        `Service ${name} already exists on entity ${this.source.name}`,
      );
    }

    if (extension !== ".js") {
      throw new Error("ThingShape services must be JS-backed.");
    }

    this.source.serviceDefinitions[name] = definition;
    this.source.serviceImplementations[name] = buildScriptServiceImplementation(
      name,
      source,
    );
  }
}
