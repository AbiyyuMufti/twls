import * as assert from "node:assert";
import type { ProjectMeta } from "../../core/entity/project";

import { buildEntityPickItem, buildProjectPickItem } from "../../features/pickers/pick-item";
import { EntityMeta } from "../../entity/entity";

const entityMeta: EntityMeta = {
  name: "MeterReadingShape",
  projectName: "TWLS Demo",
  type: "ThingShape",
  parentType: "ThingShapes",
};

const projectMeta: ProjectMeta = {
  name: "TWLS Demo",
  projectName: "TWLS Demo",
  type: "Project",
  parentType: "Projects",
};

suite("pick-item", () => {
  test("entity pick hides the currently selected entity", () => {
    const item = buildEntityPickItem(entityMeta, entityMeta.name);
    assert.strictEqual(item, undefined);
  });

  test("entity pick maps other entities to labelled items", () => {
    const item = buildEntityPickItem(entityMeta, "SomeOtherEntity");

    assert.ok(item);
    assert.strictEqual(item.label, entityMeta.name);
    assert.strictEqual(item.description, entityMeta.type);
    assert.strictEqual(item.detail, entityMeta.projectName);
    assert.strictEqual(item.name, entityMeta.name);
  });

  test("project pick never hides a project sharing the entity name", () => {
    const item = buildProjectPickItem(projectMeta);

    assert.ok(item);
    assert.strictEqual(item.label, projectMeta.name);
    assert.strictEqual(item.description, projectMeta.type);
    assert.strictEqual(item.detail, projectMeta.projectName);
  });
});
