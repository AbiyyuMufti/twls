import * as assert from "node:assert";
import { buildArtifactRelativePath } from "../../artifact-path";

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
});
