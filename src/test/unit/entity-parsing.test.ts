import * as assert from "node:assert";
import { ThingShape } from "../../core/entity/thing-shape";
import { ThingTemplate } from "../../core/entity/thing-template";
import {
  dualTableThingTemplateSource,
  getHistorySql,
  getReadingCode,
  readingChangedCode,
  multiRowThingShapeSource,
  noServiceImplementationsThingShapeSource,
  notifyCode,
  resetReadingCode,
  scriptLessThingShapeSource,
  tablelessThingTemplateSource,
  thingShapeMeta,
  thingShapeSource,
  thingTemplateMeta,
  thingTemplateSource,
} from "../fixtures/entity-sources";

suite("entity-parsing", () => {
  suite("ThingShape", () => {
    test("getServices returns one .js service per script implementation", () => {
      const services = new ThingShape(
        thingShapeMeta,
        thingShapeSource,
      ).getServices();

      assert.strictEqual(services.length, 2);

      const getReading = services.find(
        (service) => service.name === "GetReading",
      );
      assert.ok(getReading);
      assert.strictEqual(getReading.extension, ".js");
      assert.strictEqual(getReading.source, getReadingCode);

      const resetReading = services.find(
        (service) => service.name === "ResetReading",
      );
      assert.ok(resetReading);
      assert.strictEqual(resetReading.extension, ".js");
      assert.strictEqual(resetReading.source, resetReadingCode);
    });

    test("rejects an implementation whose Script table has more than one row", () => {
      assert.throws(
        () => new ThingShape(thingShapeMeta, multiRowThingShapeSource),
      );
    });

    test("rejects an implementation without a Script table", () => {
      assert.throws(
        () => new ThingShape(thingShapeMeta, scriptLessThingShapeSource),
      );
    });

    test("rejects a source without serviceImplementations", () => {
      assert.throws(
        () =>
          new ThingShape(
            thingShapeMeta,
            noServiceImplementationsThingShapeSource,
          ),
      );
    });

    test("updateService changes the code served by getServices", () => {
      const thingShape = new ThingShape(thingShapeMeta, thingShapeSource);
      const updatedCode = "return me.LatestReading;";

      thingShape.updateService("GetReading", updatedCode);

      const updated = thingShape
        .getServices()
        .find((service) => service.name === "GetReading");
      assert.ok(updated);
      assert.strictEqual(updated.source, updatedCode);
    });

    test("getSubscriptions returns one .js subscription per subscription", () => {
      const subscriptions = new ThingShape(
        thingShapeMeta,
        thingShapeSource,
      ).getSubscriptions();

      assert.strictEqual(subscriptions.length, 1);

      const subscription = subscriptions.find(
        (subscription) => subscription.name === "ReadingChanged",
      );

      assert.ok(subscription);
      assert.strictEqual(subscription.extension, ".js");
      assert.strictEqual(subscription.source, readingChangedCode);
    });

    test("updateSubscription changes the code served by getSubscriptions", () => {
      const thingShape = new ThingShape(thingShapeMeta, thingShapeSource);
      const updatedCode = "me.LogReading();";

      thingShape.updateSubscription("ReadingChanged", updatedCode);

      const updated = thingShape
        .getSubscriptions()
        .find((subscription) => subscription.name === "ReadingChanged");

      assert.ok(updated);
      assert.strictEqual(updated.source, updatedCode);
    });
  });

  suite("ThingTemplate", () => {
    test("getServices maps Query rows to .sql and Script rows to .js", () => {
      const services = new ThingTemplate(
        thingTemplateMeta,
        thingTemplateSource,
      ).getServices();

      assert.strictEqual(services.length, 2);

      const getHistory = services.find(
        (service) => service.name === "GetHistory",
      );
      assert.ok(getHistory);
      assert.strictEqual(getHistory.extension, ".sql");
      assert.strictEqual(getHistory.source, getHistorySql);

      const notify = services.find((service) => service.name === "Notify");
      assert.ok(notify);
      assert.strictEqual(notify.extension, ".js");
      assert.strictEqual(notify.source, notifyCode);
    });

    test("rejects an implementation defining both Query and Script tables", () => {
      assert.throws(
        () =>
          new ThingTemplate(thingTemplateMeta, dualTableThingTemplateSource),
      );
    });

    test("rejects an implementation defining neither Query nor Script tables", () => {
      assert.throws(
        () =>
          new ThingTemplate(thingTemplateMeta, tablelessThingTemplateSource),
      );
    });

    test("updateService rewrites the Query sql of a .sql service", () => {
      const thingTemplate = new ThingTemplate(
        thingTemplateMeta,
        thingTemplateSource,
      );
      const updatedSql = "SELECT * FROM MeterHistory;";

      thingTemplate.updateService("GetHistory", updatedSql);

      const updated = thingTemplate
        .getServices()
        .find((service) => service.name === "GetHistory");
      assert.ok(updated);
      assert.strictEqual(updated.extension, ".sql");
      assert.strictEqual(updated.source, updatedSql);
    });

    test("getSubscriptions returns one .js subscription per subscription", () => {
      const subscriptions = new ThingTemplate(
        thingTemplateMeta,
        thingTemplateSource,
      ).getSubscriptions();

      assert.strictEqual(subscriptions.length, 1);

      const subscription = subscriptions.find(
        (subscription) => subscription.name === "ReadingChanged",
      );

      assert.ok(subscription);
      assert.strictEqual(subscription.extension, ".js");
      assert.strictEqual(subscription.source, readingChangedCode);
    });

    test("updateSubscription changes the code served by getSubscriptions", () => {
      const thingTemplate = new ThingTemplate(
        thingTemplateMeta,
        thingTemplateSource,
      );
      const updatedCode = "me.LogReading();";

      thingTemplate.updateSubscription("ReadingChanged", updatedCode);

      const updated = thingTemplate
        .getSubscriptions()
        .find((subscription) => subscription.name === "ReadingChanged");

      assert.ok(updated);
      assert.strictEqual(updated.source, updatedCode);
    });
  });
});
