import * as assert from "node:assert";
import { normalizeEol } from "../../text";

suite("dirty-detection", () => {
  test("treats a CRLF local source as equal to an LF server source", () => {
    const serverSource = "var x = 1;\nreturn x;";
    const localSource = serverSource.replace(/\n/g, "\r\n");

    assert.strictEqual(
      normalizeEol(localSource),
      normalizeEol(serverSource),
    );
  });

  test("normalizes lone CR line endings", () => {
    assert.strictEqual(normalizeEol("a\rb\rc"), "a\nb\nc");
  });

  test("keeps LF-only text unchanged", () => {
    assert.strictEqual(normalizeEol("a\nb\nc"), "a\nb\nc");
  });

  test("handles empty text", () => {
    assert.strictEqual(normalizeEol(""), "");
  });
});
