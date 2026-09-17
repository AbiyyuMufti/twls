import assert from "node:assert";
import {
  createStashEntry,
  sortStashEntriesNewestFirst,
  stashEntrySchema,
  stashIdSchema,
} from "../../stash";

suite("stash", () => {
  test("createStashEntry captures entity name and files", () => {
    const files = [
      {
        relativePath: ["P", "E", "services", "Foo.js"],
        kind: "service" as const,
        deleted: false,
        content: "x",
      },
    ];
    const entry = createStashEntry("MyEntity", files);

    assert.strictEqual(entry.entityName, "MyEntity");
    assert.deepStrictEqual(entry.files, files);
    assert.ok(entry.id.length > 0);
    assert.ok(entry.createdAt.length > 0);
  });

  test("sortStashEntriesNewestFirst orders newer entries first", () => {
    const older = createStashEntry("A", []);
    const newer = createStashEntry("B", []);

    assert.deepStrictEqual(sortStashEntriesNewestFirst([older, newer]), [
      newer,
      older,
    ]);
  });

  test("stashEntrySchema accepts a valid entry", () => {
    const entry = createStashEntry("MyEntity", [
      {
        relativePath: ["P", "E", "services", "Foo.js"],
        kind: "service",
        deleted: false,
        content: "x",
      },
    ]);

    assert.strictEqual(stashEntrySchema.safeParse(entry).success, true);
  });

  test("stashEntrySchema rejects a malformed entry", () => {
    const malformed = {
      id: "1",
      entityName: "MyEntity",
      createdAt: "now",
      files: [{ relativePath: "not-an-array", kind: "widget" }],
    };

    assert.strictEqual(stashEntrySchema.safeParse(malformed).success, false);
  });

  test("stashIdSchema accepts generated ids and rejects path traversal", () => {
    assert.strictEqual(stashIdSchema.safeParse("1700000000000-000001").success, true);
    assert.strictEqual(stashIdSchema.safeParse("0-000001").success, true);
    assert.strictEqual(stashIdSchema.safeParse("1700000000000-1000000").success, true);
    assert.strictEqual(stashIdSchema.safeParse("../../thingworx").success, false);
    assert.strictEqual(stashIdSchema.safeParse("1").success, false);
    assert.strictEqual(stashIdSchema.safeParse("1-2/../../x").success, false);
    assert.strictEqual(stashIdSchema.safeParse("1-2").success, false);
    assert.strictEqual(stashIdSchema.safeParse("01-000001").success, false);
  });

  test("stashEntrySchema rejects a relativePath that escapes the root", () => {
    const entry = createStashEntry("MyEntity", [
      {
        relativePath: ["..", "..", "thingworx"],
        kind: "service",
        deleted: false,
        content: "x",
      },
    ]);

    assert.strictEqual(stashEntrySchema.safeParse(entry).success, false);
  });

  test("stashEntrySchema rejects a relativePath segment with a separator", () => {
    const entry = createStashEntry("MyEntity", [
      {
        relativePath: ["P", "E", "services", "..\\..\\Foo.js"],
        kind: "service",
        deleted: false,
        content: "x",
      },
    ]);

    assert.strictEqual(stashEntrySchema.safeParse(entry).success, false);
  });
});
