import * as assert from "node:assert";
import { ThingShape } from "../../core/entity/thing-shape";
import { ThingTemplate } from "../../core/entity/thing-template";
import type { EntityMeta } from "../../core/entity/entity";
import { resolveRemoteArtifactContent } from "../../features/sync/remote";
import { buildServiceDefinitionYaml } from "../../features/service-definitions/templates";
import {
  readingChangedCode,
  thingShapeMeta,
  thingShapeSource,
} from "../fixtures/entity-sources";
import { thingTemplateWithServiceDefinitions } from "../fixtures/service-definition-sources";

const templateMeta: EntityMeta = {
  name: "TestThingTemplate",
  projectName: "TestProject",
  type: "ThingTemplate",
  parentType: "ThingTemplates",
};

suite("resolveRemoteArtifactContent", () => {
  const template = new ThingTemplate(
    templateMeta,
    thingTemplateWithServiceDefinitions,
  );

  test("serves the canonical yaml for a service definition", () => {
    const definition = template.getServiceDefinition("GetLineMasterOee");
    assert.ok(definition);

    assert.strictEqual(
      resolveRemoteArtifactContent(
        template,
        "services",
        "GetLineMasterOee.yaml",
      ),
      buildServiceDefinitionYaml(
        definition,
        template.getServiceQueryConfig("GetLineMasterOee"),
      ),
    );
  });

  test("reports a missing definition for an entity pulled without one", () => {
    const shape = new ThingShape(thingShapeMeta, thingShapeSource);

    assert.strictEqual(
      resolveRemoteArtifactContent(shape, "services", "GetReading.yaml"),
      "Service definition not found: GetReading",
    );
  });

  test("still serves a SQL service's code by name and extension", () => {
    assert.match(
      resolveRemoteArtifactContent(
        template,
        "services",
        "GetLineMasterOee.sql",
      ),
      /^SELECT line_id/,
    );
  });

  test("reports an unknown service", () => {
    assert.strictEqual(
      resolveRemoteArtifactContent(template, "services", "Nope.js"),
      "Service not found: Nope",
    );
  });

  test("serves a subscription's code", () => {
    const shape = new ThingShape(thingShapeMeta, thingShapeSource);

    assert.strictEqual(
      resolveRemoteArtifactContent(shape, "subscriptions", "ReadingChanged.js"),
      readingChangedCode,
    );
  });

  test("reports an unsupported artifact type", () => {
    assert.strictEqual(
      resolveRemoteArtifactContent(template, "widgets", "Foo.js"),
      "Unsupported artifact type: widgets",
    );
  });
});
