import assert from "node:assert/strict";
import {
  buildServiceInvocationStub,
  formatServiceInvocationResult,
  parseServiceInvocationParams,
} from "../../features/service-invocation/format";
import type { ServiceDefinition } from "../../core/entity/service-definition-schema";

suite("service-invocation", () => {
  suite("parseServiceInvocationParams", () => {
    test("parses a flat JSON object", () => {
      const result = parseServiceInvocationParams('{"paramStr":"hi"}');
      assert.deepEqual(result, { paramStr: "hi" });
    });

    test("rejects invalid JSON", () => {
      assert.throws(
        () => parseServiceInvocationParams("{not json"),
        /Invalid JSON/,
      );
    });

    test("rejects a JSON array", () => {
      assert.throws(
        () => parseServiceInvocationParams("[1,2,3]"),
        /must be a JSON object/,
      );
    });

    test("rejects a JSON primitive", () => {
      assert.throws(
        () => parseServiceInvocationParams('"hello"'),
        /must be a JSON object/,
      );
    });

    test("rejects null", () => {
      assert.throws(
        () => parseServiceInvocationParams("null"),
        /must be a JSON object/,
      );
    });
  });

  suite("buildServiceInvocationStub", () => {
    test("returns {} when there is no definition", () => {
      assert.equal(buildServiceInvocationStub(undefined), "{}");
    });

    test("builds placeholders per base type, ordered by ordinal", () => {
      const definition = {
        parameterDefinitions: {
          b: { name: "b", description: "", baseType: "NUMBER", ordinal: 2 },
          a: { name: "a", description: "", baseType: "STRING", ordinal: 1 },
        },
      } as unknown as ServiceDefinition;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const stub = JSON.parse(buildServiceInvocationStub(definition));
      assert.deepEqual(stub, { a: "", b: 0 });
      assert.deepEqual(Object.keys(stub), ["a", "b"]);
    });

    test("falls back to empty string for an unknown base type", () => {
      const definition = {
        parameterDefinitions: {
          x: { name: "x", description: "", baseType: "WEIRD", ordinal: 1 },
        },
      } as unknown as ServiceDefinition;

      assert.deepEqual(JSON.parse(buildServiceInvocationStub(definition)), {
        x: "",
      });
    });
  });

  suite("formatServiceInvocationResult", () => {
    test("shows parsed JSON body when available", () => {
      const output = formatServiceInvocationResult(
        "TestTiming",
        "randomService",
        { paramStr: "hi" },
        {
          status: 200,
          statusText: "OK",
          ok: true,
          rawBody: '{"result":42}',
          jsonBody: { result: 42 },
        },
      );

      assert.match(output, /OK — 200 OK/);
      assert.match(output, /"result": 42/);
    });

    test("falls back to raw body when response isn't JSON", () => {
      const output = formatServiceInvocationResult(
        "TestTiming",
        "randomService",
        {},
        {
          status: 500,
          statusText: "Internal Server Error",
          ok: false,
          rawBody: "boom",
          jsonBody: undefined,
        },
      );

      assert.match(output, /FAILED — 500/);
      assert.match(output, /boom/);
    });
  });
});
