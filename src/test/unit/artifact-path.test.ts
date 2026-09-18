import * as assert from "node:assert";
import type { Service, Subscription } from "../../entity/entity";
import { ThingShape } from "../../entity/thing-shape";
import {
  artifactKindFromFolderName,
  buildArtifactRelativePath,
  buildArtifactFolderRelativePath,
  buildEntityArtifactRelativePaths,
  parseArtifactPath,
  resolveArtifact,
} from "../../utilities/artifact-path";
import { thingShapeMeta, thingShapeSource } from "../fixtures/entity-sources";

suite("artifact-path", () => {
  test("builds a service path under services/", () => {
    const segments = buildArtifactRelativePath(
      { projectName: "TWLS.Demo", name: "MeterReadingShape" },
      "service",
      "GetReading",
      ".js",
    );

    assert.deepStrictEqual(segments, [
      "TWLS.Demo",
      "MeterReadingShape",
      "services",
      "GetReading.js",
    ]);
  });

  test("builds a subscription path under subscriptions/", () => {
    const segments = buildArtifactRelativePath(
      { projectName: "TWLS.Demo", name: "MeterReadingShape" },
      "subscription",
      "SendEmailAndUpdateFrimTable",
      ".js",
    );

    assert.deepStrictEqual(segments, [
      "TWLS.Demo",
      "MeterReadingShape",
      "subscriptions",
      "SendEmailAndUpdateFrimTable.js",
    ]);
  });

  test("builds the containing folder path for a kind", () => {
    const segments = buildArtifactFolderRelativePath(
      { projectName: "TWLS.Demo", name: "MeterReadingShape" },
      "service",
    );

    assert.deepStrictEqual(segments, [
      "TWLS.Demo",
      "MeterReadingShape",
      "services",
    ]);
  });

  test("maps folder segments back to artifact kinds", () => {
    assert.strictEqual(artifactKindFromFolderName("services"), "service");
    assert.strictEqual(
      artifactKindFromFolderName("subscriptions"),
      "subscription",
    );
    assert.strictEqual(artifactKindFromFolderName("entities"), undefined);
  });

  test("parses a service file path", () => {
    assert.deepStrictEqual(
      parseArtifactPath("TWLS.Demo/MeterReadingShape/services/GetReading.js"),
      { kind: "service", name: "GetReading", extension: ".js" },
    );
  });

  test("parses a subscription file path", () => {
    assert.deepStrictEqual(
      parseArtifactPath(
        "TWLS.Demo/MeterReadingShape/subscriptions/ReadingChanged.js",
      ),
      { kind: "subscription", name: "ReadingChanged", extension: ".js" },
    );
  });

  test("parses a Windows absolute path", () => {
    assert.deepStrictEqual(
      parseArtifactPath(
        "C:\\ws\\TWLS.Demo\\MeterReadingShape\\services\\GetReading.js",
      ),
      { kind: "service", name: "GetReading", extension: ".js" },
    );
  });

  test("rejects the legacy flat layout and unknown folders", () => {
    assert.strictEqual(
      parseArtifactPath("TWLS.Demo/MeterReadingShape/GetReading.js"),
      undefined,
    );
    assert.strictEqual(
      parseArtifactPath("TWLS.Demo/MeterReadingShape/scripts/GetReading.js"),
      undefined,
    );
  });

  test("rejects files without an extension", () => {
    assert.strictEqual(
      parseArtifactPath("TWLS.Demo/MeterReadingShape/services/GetReading"),
      undefined,
    );
  });

  test("enumerates an entity's services then its subscriptions", () => {
    const entity = new ThingShape(thingShapeMeta, thingShapeSource);

    assert.deepStrictEqual(buildEntityArtifactRelativePaths(entity), [
      ["TWLS.Demo", "MeterReadingShape", "services", "GetReading.js"],
      ["TWLS.Demo", "MeterReadingShape", "services", "ResetReading.js"],
      ["TWLS.Demo", "MeterReadingShape", "subscriptions", "ReadingChanged.js"],
    ]);
  });

  test("resolves a colliding name by the artifact folder, not filename", () => {
    const services: Service[] = [
      { name: "Foo", source: "service source", extension: ".js" },
    ];
    const subscriptions: Subscription[] = [
      { name: "Foo", source: "subscription source", extension: ".js" },
    ];

    assert.deepStrictEqual(
      resolveArtifact(
        "TWLS.Demo/Entity/services/Foo.js",
        services,
        subscriptions,
      ),
      { kind: "service", artifact: services[0] },
    );
    assert.deepStrictEqual(
      resolveArtifact(
        "TWLS.Demo/Entity/subscriptions/Foo.js",
        services,
        subscriptions,
      ),
      { kind: "subscription", artifact: subscriptions[0] },
    );
  });

  test("returns undefined when the artifact or folder is unknown", () => {
    assert.strictEqual(
      resolveArtifact("TWLS.Demo/Entity/services/Missing.js", [], []),
      undefined,
    );
    assert.strictEqual(
      resolveArtifact("TWLS.Demo/Entity/scripts/Foo.js", [], []),
      undefined,
    );
  });
});
