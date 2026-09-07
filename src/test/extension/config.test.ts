import * as assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as vscode from "vscode";
import { Config } from "../../config";

suite("config", () => {
  const baseUrl = "http://twx.example.com:8080/Thingworx";
  const appKey = "550e8400-e29b-41d4-a716-446655440000";
  const entityName = "MeterReadingShape";

  let tempDir: string;
  let rootUri: vscode.Uri;

  suiteSetup(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "twls-config-"));
    fs.mkdirSync(path.join(tempDir, Config.FOLDER_NAME), { recursive: true });
    rootUri = vscode.Uri.file(tempDir);
  });

  suiteTeardown(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("round-trips non-secret fields through save and load", async () => {
    const config = new Config(rootUri, baseUrl, appKey, entityName);
    await config.save();

    const loaded = await Config.load(rootUri);
    assert.strictEqual(loaded.baseUrl, baseUrl);
    assert.strictEqual(loaded.entityName, entityName);
  });

  test("derives the host from the saved base URL", async () => {
    const config = new Config(rootUri, baseUrl, appKey, entityName);
    await config.save();

    const loaded = await Config.load(rootUri);
    assert.strictEqual(loaded.host, "twx.example.com:8080");
  });

  test("rejects a config file with an invalid base URL", async () => {
    const fileUri = vscode.Uri.joinPath(
      rootUri,
      Config.FOLDER_NAME,
      "thingworx.json",
    );
    fs.writeFileSync(
      fileUri.fsPath,
      JSON.stringify({ baseUrl: "not-a-url", entityName }),
    );

    await assert.rejects(Config.load(rootUri));
  });
});
