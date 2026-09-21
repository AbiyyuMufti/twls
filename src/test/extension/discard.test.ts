import * as assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as vscode from "vscode";
import { Config } from "../../config";
import type { EntityMeta } from "../../core/entity/entity";
import { ThingShape } from "../../core/entity/thing-shape";
import { buildArtifactRelativePath } from "../../core/utilities/artifact-path";
import {
  buildServiceDefinitionYaml,
  DEFINITION_EXTENSION,
} from "../../features/service-definitions/templates";
import { Repository } from "../../features/sync/repository";
import { thingShapeWithServiceDefinition } from "../fixtures/service-definition-sources";
import { exists } from "./stash.test";

const meta: EntityMeta = {
  name: "test_timing",
  projectName: "TestProject",
  type: "ThingShape",
  parentType: "ThingShapes",
};

const baseUrl = "http://twx.example.com:8080/Thingworx";
const appKey = "550e8400-e29b-41d4-a716-446655440000";

suite("Repository discard (service definition)", () => {
  let root: vscode.Uri;
  let entity: ThingShape;
  let repo: Repository;

  setup(() => {
    root = vscode.Uri.file(
      fs.mkdtempSync(path.join(os.tmpdir(), "twls-discard-")),
    );
    entity = new ThingShape(meta, thingShapeWithServiceDefinition);
    repo = new Repository(
      root,
      new Config(root, baseUrl, appKey, meta.name),
      entity,
    );
  });

  teardown(() => {
    repo.dispose();
    fs.rmSync(root.fsPath, { recursive: true, force: true });
  });

  function definitionUri(serviceName: string): vscode.Uri {
    return vscode.Uri.joinPath(
      root,
      ...buildArtifactRelativePath(
        meta,
        "service",
        serviceName,
        DEFINITION_EXTENSION,
      ),
    );
  }

  async function readText(uri: vscode.Uri): Promise<string> {
    return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
  }

  test("restores an edited sidecar to the canonical remote yaml", async () => {
    const definition = entity.getServiceDefinition("testServiceWithParam");
    assert.ok(definition);

    const uri = definitionUri("testServiceWithParam");
    await vscode.workspace.fs.writeFile(
      uri,
      new TextEncoder().encode("description: edited\n"),
    );

    await repo.discard(uri);

    assert.strictEqual(
      await readText(uri),
      buildServiceDefinitionYaml(definition),
    );
  });

  test("recreates a deleted sidecar", async () => {
    const definition = entity.getServiceDefinition("testServiceWithParam");
    assert.ok(definition);

    const uri = definitionUri("testServiceWithParam");
    await repo.discard(uri);

    assert.strictEqual(
      await readText(uri),
      buildServiceDefinitionYaml(definition),
    );
  });

  test("rejects a sidecar for a service the entity doesn't have", async () => {
    await assert.rejects(
      () => repo.discard(definitionUri("Nope")),
      /Service definition not found: Nope/,
    );
  });

  function artifactUri(name: string, extension: string): vscode.Uri {
    return vscode.Uri.joinPath(
      root,
      ...buildArtifactRelativePath(meta, "service", name, extension),
    );
  }

  test("discarding a new service's code file removes its sidecar too", async () => {
    await repo.scaffoldNewService("BrandNew", "js");

    await repo.discard(artifactUri("BrandNew", ".js"));

    assert.strictEqual(await exists(artifactUri("BrandNew", ".js")), false);
    assert.strictEqual(
      await exists(artifactUri("BrandNew", DEFINITION_EXTENSION)),
      false,
    );
  });

  test("discarding only a new service's sidecar keeps its code file", async () => {
    await repo.scaffoldNewService("BrandNew", "js");

    await repo.discard(artifactUri("BrandNew", DEFINITION_EXTENSION));

    assert.strictEqual(await exists(artifactUri("BrandNew", ".js")), true);
    assert.strictEqual(
      await exists(artifactUri("BrandNew", DEFINITION_EXTENSION)),
      false,
    );
  });
});
