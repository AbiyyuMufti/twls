import z from "zod";
import { Entity, EntityMeta, Service } from "../thingworx";

export class ThingShape implements Entity {
  private readonly schema = z.looseObject({
    name: z.string(),
    lastModifiedDate: z.number(),
    serviceImplementations: z.record(
      z.string(),
      z.looseObject({
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
    ),
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

  setLastModifiedDate(value: number): void {
    this.source.lastModifiedDate = value;
  }
}
