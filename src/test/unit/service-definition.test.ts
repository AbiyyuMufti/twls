import assert from "node:assert";
import { ThingShape } from "../../core/entity/thing-shape";
import { ThingTemplate } from "../../core/entity/thing-template";
import type { EntityMeta } from "../../core/entity/entity";
import {
  thingShapeWithServiceDefinition,
  thingTemplateWithServiceDefinitions,
} from "../fixtures/service-definition-sources";

const thingShapeMeta: EntityMeta = {
  name: "test_timing",
  projectName: "TestProject",
  type: "ThingShape",
  parentType: "ThingShapes",
};

const thingTemplateMeta: EntityMeta = {
  name: "TestThingTemplate",
  projectName: "TestProject",
  type: "ThingTemplate",
  parentType: "ThingTemplates",
};

suite("ThingShape.getServiceDefinition", () => {
  test("returns the parameter list and result type for a known service", () => {
    const entity = new ThingShape(
      thingShapeMeta,
      thingShapeWithServiceDefinition,
    );

    const definition = entity.getServiceDefinition("testServiceWithParam");

    assert.ok(definition);
    assert.strictEqual(definition.resultType.baseType, "STRING");
    assert.deepStrictEqual(Object.keys(definition.parameterDefinitions), [
      "stringParam",
    ]);
    assert.strictEqual(
      definition.parameterDefinitions.stringParam?.baseType,
      "STRING",
    );
  });

  test("returns undefined for an unknown service", () => {
    const entity = new ThingShape(
      thingShapeMeta,
      thingShapeWithServiceDefinition,
    );

    assert.strictEqual(entity.getServiceDefinition("doesNotExist"), undefined);
  });
});

suite("ThingTemplate.getServiceDefinition", () => {
  test("returns parameter definitions for a JS service with a parameter", () => {
    const entity = new ThingTemplate(
      thingTemplateMeta,
      thingTemplateWithServiceDefinitions,
    );

    const definition = entity.getServiceDefinition(
      "DebugGetEquipmentStatusByFilter",
    );

    assert.ok(definition);
    assert.strictEqual(
      definition.parameterDefinitions.equipmentIds?.baseType,
      "STRING",
    );
  });

  test("returns an empty parameterDefinitions record for a no-arg SQL service", () => {
    const entity = new ThingTemplate(
      thingTemplateMeta,
      thingTemplateWithServiceDefinitions,
    );

    const definition = entity.getServiceDefinition("GetLineMasterOee");

    assert.ok(definition);
    assert.deepStrictEqual(definition.parameterDefinitions, {});
    assert.strictEqual(definition.resultType.baseType, "INFOTABLE");
  });

  test("handles a SQL service with multiple parameters across base types", () => {
    const entity = new ThingTemplate(
      thingTemplateMeta,
      thingTemplateWithServiceDefinitions,
    );

    const definition = entity.getServiceDefinition("AddBMKComparisonMapping");

    assert.ok(definition);
    assert.strictEqual(Object.keys(definition.parameterDefinitions).length, 5);
    assert.strictEqual(
      definition.parameterDefinitions.isProductive?.baseType,
      "BOOLEAN",
    );
    assert.strictEqual(
      definition.parameterDefinitions.startTime?.baseType,
      "DATETIME",
    );
  });

  test("returns undefined for an unknown service", () => {
    const entity = new ThingTemplate(
      thingTemplateMeta,
      thingTemplateWithServiceDefinitions,
    );

    assert.strictEqual(entity.getServiceDefinition("doesNotExist"), undefined);
  });
});
