import z from "zod";
import { Entity, EntityMeta, Service, Subscription } from "./entity";
import {
  ServiceDefinition,
  serviceDefinitionsSchema,
} from "./zod-service-definition";
import {
  queryConfigurationTableSchema,
  scriptConfigurationTableSchema,
} from "./zod-service-implementation";
import { subscriptionsSchema } from "./zod-subscription";

/**
 * A ThingWorx thing template. Services and subscriptions are looked up from
 * the template's `thingShape` definition: each service is backed by either a
 * `Script` table (`.js`) or a SQL `Query` table (`.sql`) — never both — while
 * each subscription is backed by a `Script` table (`.js`).
 * `thingShape.serviceDefinitions` holds each service's parameter list and
 * result type, separate from the executable code/SQL in
 * `serviceImplementations`.
 */
export class ThingTemplate implements Entity {
  private readonly schema = z.looseObject({
    name: z.string(),
    lastModifiedDate: z.number(),
    thingShape: z.looseObject({
      serviceDefinitions: serviceDefinitionsSchema.default({}),
      serviceImplementations: z.record(
        z.string(),
        z.looseObject({
          configurationTables: z
            .looseObject({
              Query: queryConfigurationTableSchema.shape.Query.optional(),
              Script: scriptConfigurationTableSchema.shape.Script.optional(),
            })
            .superRefine((value, ctx) => {
              const hasQuery = value.Query !== undefined;
              const hasScript = value.Script !== undefined;

              if (hasQuery && hasScript) {
                ctx.addIssue({
                  code: "custom",
                  message: "Only one of Query or Script may be defined",
                });
              }

              if (!hasQuery && !hasScript) {
                ctx.addIssue({
                  code: "custom",
                  message: "One of Query or Script must be defined",
                });
              }
            }),
        }),
      ),
      subscriptions: subscriptionsSchema.default({}),
    }),
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

  /** Returns one service per implementation: `.sql` for query rows, `.js` for scripts. */
  getServices(): Service[] {
    const services: Service[] = [];

    for (const [serviceName, implementation] of Object.entries(
      this.source.thingShape.serviceImplementations,
    )) {
      const queryRow = implementation.configurationTables.Query?.rows[0];
      const scriptRow = implementation.configurationTables.Script?.rows[0];

      if (queryRow) {
        services.push({
          name: serviceName,
          source: queryRow.sql,
          extension: ".sql",
        });
      } else if (scriptRow) {
        services.push({
          name: serviceName,
          source: scriptRow.code,
          extension: ".js",
        });
      }
    }

    return services;
  }

  /** Returns one subscription per script implementation, each as a `.js` file. */
  getSubscriptions(): Subscription[] {
    const subscriptions: Subscription[] = [];

    for (const [subscriptionName, subscription] of Object.entries(
      this.source.thingShape.subscriptions,
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
    return this.source.thingShape.serviceDefinitions[name];
  }

  /** Replaces the query SQL or script code of an existing service. */
  updateService(name: string, source: string): void {
    const implementation = this.source.thingShape.serviceImplementations[name];

    if (!implementation) {
      throw new Error(
        `Service ${name} does not exist on entity ${this.source.name}`,
      );
    }

    const queryRow = implementation.configurationTables.Query?.rows[0];
    const scriptRow = implementation.configurationTables.Script?.rows[0];

    if (!queryRow && !scriptRow) {
      throw new Error("Invalid source");
    }

    if (queryRow) {
      queryRow.sql = source;
    } else if (scriptRow) {
      scriptRow.code = source;
    }
  }

  /** Replaces the script code of an existing subscription. */
  updateSubscription(name: string, source: string): void {
    const implementation =
      this.source.thingShape.subscriptions[name]?.serviceImplementation;

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
}
