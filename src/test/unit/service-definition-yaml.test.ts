import * as assert from "node:assert";
import yaml from "js-yaml";
import { ThingTemplate } from "../../core/entity/thing-template";
import type { EntityMeta } from "../../core/entity/entity";
import { serviceDefinitionAuthoringSchema } from "../../core/entity/service-definition-schema";
import {
  buildDefinitionHeaderComment,
  buildServiceDefinitionYaml,
} from "../../features/service-definitions/templates";
import { thingTemplateWithServiceDefinitions } from "../fixtures/service-definition-sources";

const meta: EntityMeta = {
  name: "TestThingTemplate",
  projectName: "TestProject",
  type: "ThingTemplate",
  parentType: "ThingTemplates",
};

function build(serviceName: string): string {
  const entity = new ThingTemplate(meta, thingTemplateWithServiceDefinitions);
  const definition = entity.getServiceDefinition(serviceName);
  assert.ok(definition);
  return buildServiceDefinitionYaml(
    definition,
    entity.getServiceQueryConfig(serviceName),
  );
}

suite("buildServiceDefinitionYaml", () => {
  test("starts with the header comment", () => {
    assert.ok(
      build("GetLineMasterOee").startsWith(buildDefinitionHeaderComment()),
    );
  });

  test("a SQL service includes timeout and maxItems", () => {
    const parsed = serviceDefinitionAuthoringSchema.parse(
      yaml.load(build("GetLineMasterOee")),
    );

    assert.deepStrictEqual(parsed, {
      description: "",
      category: "oee",
      params: [],
      result: "INFOTABLE",
      timeout: 60,
      maxItems: 0,
    });
  });

  test("a JS service omits timeout and maxItems", () => {
    const parsed = serviceDefinitionAuthoringSchema.parse(
      yaml.load(build("DebugGetEquipmentStatusByFilter")),
    );

    assert.strictEqual(parsed.timeout, undefined);
    assert.strictEqual(parsed.maxItems, undefined);
  });

  test("params are written in ordinal order, not key order", () => {
    const parsed = serviceDefinitionAuthoringSchema.parse(
      yaml.load(build("AddBMKComparisonMapping")),
    );

    assert.deepStrictEqual(
      parsed.params.map((param) => param.name),
      [
        "packingPlanResultId",
        "equipmentId",
        "startTime",
        "flavor",
        "isProductive",
      ],
    );
  });
});
