import z from "zod";
import { Entity, EntityMeta, Service, Subscription } from "../thingworx";

/**
 * A ThingWorx thing template. Services are looked up from the template's
 * `thingShape` definition: each service is backed by either a `Script` table
 * (`.js`) or a SQL `Query` table (`.sql`) — never both.
 */
export class ThingTemplate implements Entity {
  private readonly schema = z.looseObject({
    name: z.string(),
    lastModifiedDate: z.number(),
    thingShape: z.looseObject({
      serviceImplementations: z.record(
        z.string(),
        z.looseObject({
          configurationTables: z
            .looseObject({
              Query: z
                .looseObject({
                  rows: z
                    .array(
                      z.looseObject({
                        sql: z.string(),
                      }),
                    )
                    .length(1),
                })
                .optional(),
              Script: z
                .looseObject({
                  rows: z
                    .array(
                      z.looseObject({
                        code: z.string(),
                      }),
                    )
                    .length(1),
                })
                .optional(),
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
      subscriptions: z.record(
        z.string(),
        z.looseObject({
          name: z.string(),
          events: z.array(
            z.looseObject({
              sourceType: z.string(),
              alertName: z.string(),
              sourceProperty: z.string(),
              eventName: z.string(),
              alias: z.string(),
              source: z.string(),
              trigger: z.string(),
            }),
          ),
          serviceImplementation: z.looseObject({
            configurationTables: z.looseObject({
              Script: z.looseObject({
                rows: z
                  .array(
                    z.looseObject({
                      code: z.string(),
                    }),
                  )
                  .length(1),
              }),
            }),
          }),
        }),
      ),
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

    if (queryRow) {
      queryRow.sql = source;
    } else if (scriptRow) {
      scriptRow.code = source;
    }
  }

  updateSubscription(name: string, source: string): void {
    const implementation =
      this.source.thingShape.subscriptions[name]?.serviceImplementation;

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
}
