import * as assert from "node:assert";
import { ThingShape } from "../../entity/thing-shape";
import {
  artifactKindFromFolderName,
  buildArtifactRelativePath,
  buildArtifactFolderRelativePath,
  buildEntityArtifactRelativePaths,
  parseArtifactPath,
} from "../../artifact-path";
import {
  thingShapeMeta,
  thingShapeSource,
} from "../fixtures/entity-sources";

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
});
