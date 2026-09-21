import * as assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as vscode from "vscode";
import { buildArtifactRelativePath } from "../../core/utilities/artifact-path";
import { Config } from "../../config";
import { ThingShape } from "../../core/entity/thing-shape";
import { Repository } from "../../features/sync/repository";
import { createStashEntry } from "../../features/stash/model";
import { StashStore } from "../../features/stash/store";
import {
  writeEntityServices,
  writeEntitySubscriptions,
} from "../../features/sync/storage";
import {
  getReadingCode,
  thingShapeMeta,
  thingShapeSource,
} from "../fixtures/entity-sources";
import {
  buildServiceDefinitionYaml,
  DEFINITION_EXTENSION,
} from "../../features/service-definitions/templates";
import { writeEntityServiceDefinitions } from "../../features/service-definitions/storage";
import { EntityMeta } from "../../core/entity/entity";
import { thingShapeWithServiceDefinition } from "../fixtures/service-definition-sources";

const baseUrl = "http://twx.example.com:8080/Thingworx";
const appKey = "550e8400-e29b-41d4-a716-446655440000";

function createRoot(prefix: string): vscode.Uri {
  return vscode.Uri.file(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

async function writeText(uri: vscode.Uri, text: string): Promise<void> {
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, ".."));
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text));
}

async function readText(uri: vscode.Uri): Promise<string> {
  return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
}

function serviceRelativePath(name: string): string[] {
  return buildArtifactRelativePath(thingShapeMeta, "service", name, ".js");
}

suite("StashStore", () => {
  let root: vscode.Uri;
  let store: StashStore;

  setup(() => {
    root = createRoot("twls-stash-store-");
    store = new StashStore(root);
  });

  teardown(() => {
    fs.rmSync(root.fsPath, { recursive: true, force: true });
  });

  test("lists nothing when the stash folder is missing", async () => {
    assert.deepStrictEqual(await store.list(), []);
  });

  test("round-trips an entry through save, read, and list", async () => {
    const entry = createStashEntry(thingShapeMeta.name, [
      {
        relativePath: serviceRelativePath("GetReading"),
        kind: "service",
        deleted: false,
        content: "var x = 1;",
      },
    ]);

    await store.save(entry);

    assert.deepStrictEqual(await store.read(entry.id), entry);
    assert.deepStrictEqual(await store.list(), [entry]);
  });

  test("skips a corrupted entry and still lists the valid ones", async () => {
    const valid = createStashEntry(thingShapeMeta.name, []);
    await store.save(valid);

    const corruptId = "1700000000000-000001";
    await writeText(
      vscode.Uri.joinPath(root, ".twls", "stash", `${corruptId}.json`),
      "{ this is not json",
    );

    const entries = await store.list();
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0]?.id, valid.id);
    assert.strictEqual(await store.read(corruptId), undefined);
  });

  test("read ignores an id that escapes the stash folder", async () => {
    const outsideUri = vscode.Uri.joinPath(root, "thingworx.json");
    const entry = createStashEntry(thingShapeMeta.name, []);
    await writeText(outsideUri, JSON.stringify(entry));

    assert.strictEqual(await store.read("../../thingworx"), undefined);
    assert.strictEqual(await readText(outsideUri), JSON.stringify(entry));
  });

  test("delete ignores an id that escapes the stash folder", async () => {
    const outsideUri = vscode.Uri.joinPath(root, "thingworx.json");
    await writeText(outsideUri, "keep me");

    await store.delete("../../thingworx");

    assert.strictEqual(await readText(outsideUri), "keep me");
  });
});

suite("Repository stash", () => {
  let root: vscode.Uri;
  let config: Config;
  let entity: ThingShape;
  let repo: Repository;
  let store: StashStore;

  setup(async () => {
    root = createRoot("twls-repo-stash-");
    config = new Config(root, baseUrl, appKey, thingShapeMeta.name);
    await config.save();
    entity = new ThingShape(thingShapeMeta, thingShapeSource);
    repo = new Repository(root, config, entity);
    store = new StashStore(root);

    // Seed a clean working tree that matches the remote snapshot.
    await writeEntityServices(root, entity);
    await writeEntitySubscriptions(root, entity);
  });

  teardown(() => {
    repo.dispose();
    fs.rmSync(root.fsPath, { recursive: true, force: true });
  });

  function serviceUri(name: string): vscode.Uri {
    return vscode.Uri.joinPath(root, ...serviceRelativePath(name));
  }

  test("stash captures a just-saved edit and resets it to the remote snapshot", async () => {
    const edited = "var edited = true;";
    await writeText(serviceUri("GetReading"), edited);

    assert.strictEqual(await repo.stash(), 1);

    // The file on disk is reset to the last-pulled remote snapshot...
    assert.strictEqual(
      await readText(serviceUri("GetReading")),
      getReadingCode,
    );

    // ...and the edit is preserved in the stash instead of being lost.
    const [entry] = await store.list();
    assert.ok(entry);
    assert.strictEqual(entry.entityName, thingShapeMeta.name);
    assert.strictEqual(entry.files.length, 1);
    assert.strictEqual(entry.files[0]?.deleted, false);
    assert.strictEqual(entry.files[0]?.content, edited);
  });

  test("stash captures a deleted file and recreates it on reset", async () => {
    await vscode.workspace.fs.delete(serviceUri("GetReading"));

    assert.strictEqual(await repo.stash(), 1);

    assert.strictEqual(
      await readText(serviceUri("GetReading")),
      getReadingCode,
    );

    const [entry] = await store.list();
    assert.ok(entry);
    assert.strictEqual(entry.files[0]?.deleted, true);
    assert.strictEqual(entry.files[0]?.content, "");
  });

  test("stashApply writes the stashed content over a clean working tree", async () => {
    const applied = "var applied = true;";
    const entry = createStashEntry(thingShapeMeta.name, [
      {
        relativePath: serviceRelativePath("GetReading"),
        kind: "service",
        deleted: false,
        content: applied,
      },
    ]);
    await store.save(entry);

    assert.strictEqual(await repo.stashApply(entry.id), 1);
    assert.strictEqual(await readText(serviceUri("GetReading")), applied);
  });

  test("stashApply refuses to overwrite an uncommitted local change", async () => {
    const entry = createStashEntry(thingShapeMeta.name, [
      {
        relativePath: serviceRelativePath("GetReading"),
        kind: "service",
        deleted: false,
        content: "var stashed = true;",
      },
    ]);
    await store.save(entry);

    const localEdit = "var localEdit = true;";
    await writeText(serviceUri("GetReading"), localEdit);

    await assert.rejects(
      () => repo.stashApply(entry.id),
      /uncommitted changes/,
    );
    assert.strictEqual(await readText(serviceUri("GetReading")), localEdit);
  });

  test("stashPop applies the stash and removes the entry", async () => {
    const applied = "var popped = true;";
    const entry = createStashEntry(thingShapeMeta.name, [
      {
        relativePath: serviceRelativePath("GetReading"),
        kind: "service",
        deleted: false,
        content: applied,
      },
    ]);
    await store.save(entry);

    assert.strictEqual(await repo.stashPop(entry.id), 1);
    assert.strictEqual(await readText(serviceUri("GetReading")), applied);
    assert.deepStrictEqual(await store.list(), []);
  });

  test("stashList and apply-latest are scoped to the active entity", async () => {
    const mine = createStashEntry(thingShapeMeta.name, [
      {
        relativePath: serviceRelativePath("GetReading"),
        kind: "service",
        deleted: false,
        content: "var mine = true;",
      },
    ]);
    await store.save(mine);

    const other = createStashEntry("SomeOtherEntity", [
      {
        relativePath: ["P", "E", "services", "GetReading.js"],
        kind: "service",
        deleted: false,
        content: "var other = true;",
      },
    ]);
    await store.save(other);

    const entries = await repo.stashList();
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0]?.id, mine.id);

    // No-id apply picks the newest stash for the active entity, not the
    // newer overall one belonging to SomeOtherEntity.
    assert.strictEqual(await repo.stashApply(), 1);
    assert.strictEqual(
      await readText(serviceUri("GetReading")),
      "var mine = true;",
    );
  });

  test("stashApply rejects a stash belonging to another entity", async () => {
    const other = createStashEntry("SomeOtherEntity", [
      {
        relativePath: ["P", "E", "services", "Foo.js"],
        kind: "service",
        deleted: false,
        content: "x",
      },
    ]);
    await store.save(other);

    await assert.rejects(() => repo.stashApply(other.id), /belongs to entity/);
  });
});

const definitionMeta: EntityMeta = {
  name: "test_timing",
  projectName: "TestProject",
  type: "ThingShape",
  parentType: "ThingShapes",
};

export async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch (error) {
    if (error instanceof vscode.FileSystemError) {
      return false;
    }
    throw error;
  }
}

suite("Repository stash (definitions and new files)", () => {
  let root: vscode.Uri;
  let entity: ThingShape;
  let repo: Repository;
  let store: StashStore;

  setup(async () => {
    root = createRoot("twls-repo-stash-defs-");
    const config = new Config(root, baseUrl, appKey, definitionMeta.name);
    await config.save();
    entity = new ThingShape(definitionMeta, thingShapeWithServiceDefinition);
    repo = new Repository(root, config, entity);
    store = new StashStore(root);

    // Seed a clean working tree: code files plus their .yaml sidecars.
    await writeEntityServices(root, entity);
    await writeEntityServiceDefinitions(
      root,
      entity.meta,
      entity.getServices(),
      (name) => entity.getServiceDefinition(name),
      (name) => entity.getServiceQueryConfig(name),
    );
  });

  teardown(() => {
    repo.dispose();
    fs.rmSync(root.fsPath, { recursive: true, force: true });
  });

  function artifactUri(name: string, extension: string): vscode.Uri {
    return vscode.Uri.joinPath(
      root,
      ...buildArtifactRelativePath(definitionMeta, "service", name, extension),
    );
  }

  test("stash captures an edited sidecar and resets it to the canonical yaml", async () => {
    const definition = entity.getServiceDefinition("testServiceWithParam");
    assert.ok(definition);
    const uri = artifactUri("testServiceWithParam", DEFINITION_EXTENSION);
    const edited = "description: edited\n";
    await writeText(uri, edited);

    assert.strictEqual(await repo.stash(), 1);

    assert.strictEqual(
      await readText(uri),
      buildServiceDefinitionYaml(definition),
    );

    const [entry] = await store.list();
    assert.ok(entry);
    assert.deepStrictEqual(entry.files[0]?.relativePath, [
      "TestProject",
      "test_timing",
      "services",
      "testServiceWithParam.yaml",
    ]);
    assert.strictEqual(entry.files[0]?.content, edited);
  });

  test("stash captures a deleted sidecar and recreates it", async () => {
    const definition = entity.getServiceDefinition("testServiceWithParam");
    assert.ok(definition);
    const uri = artifactUri("testServiceWithParam", DEFINITION_EXTENSION);
    await vscode.workspace.fs.delete(uri);

    assert.strictEqual(await repo.stash(), 1);

    assert.strictEqual(
      await readText(uri),
      buildServiceDefinitionYaml(definition),
    );
    const [entry] = await store.list();
    assert.ok(entry);
    assert.strictEqual(entry.files[0]?.deleted, true);
  });

  test("stash removes a scaffolded service locally and apply brings it back", async () => {
    await repo.scaffoldNewService("BrandNew", "js");
    const codeUri = artifactUri("BrandNew", ".js");
    const definitionUri = artifactUri("BrandNew", DEFINITION_EXTENSION);
    const codeText = await readText(codeUri);
    const definitionText = await readText(definitionUri);

    assert.strictEqual(await repo.stash(), 2);
    assert.strictEqual(await exists(codeUri), false);
    assert.strictEqual(await exists(definitionUri), false);

    const [entry] = await store.list();
    assert.ok(entry);
    assert.ok(entry.files.every((file) => !file.deleted));

    assert.strictEqual(await repo.stashApply(), 2);
    assert.strictEqual(await readText(codeUri), codeText);
    assert.strictEqual(await readText(definitionUri), definitionText);
  });
});
