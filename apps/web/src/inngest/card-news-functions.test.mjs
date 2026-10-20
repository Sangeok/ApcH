import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const route = readFileSync(
  new URL("../app/api/inngest/route.ts", import.meta.url),
  "utf8",
);
const budget = Number(route.match(/export const maxDuration = (\d+)/)?.[1]);
const ids = ["job-a", "job-b", "job-c", "job-d"];

for (const [handler, operation] of [
  ["dispatchPendingCardNews", "dispatch"],
  ["reconcileCardNewsJobs", "recover"],
  ["cleanupCardNewsAssets", "cleanup"],
]) {
  test(`${handler}: jobs have separate durable request budgets and memoization keys`, async () => {
    assert.ok(
      budget >= 60,
      "database and producer-status work exceeds the former ten-second limit",
    );
    let consumed = null;
    const processed = [],
      flushed = [];
    const work = async (id) => {
      assert.notEqual(consumed, null, "work must run inside a durable step");
      consumed += budget * 0.6;
      if (consumed > budget) throw new Error("FUNCTION_INVOCATION_TIMEOUT");
      processed.push(id);
    };
    const features = {
      dispatchCardNewsJob: work,
      reconcileCardNewsJob: work,
      runCardNewsCleanup: work,
      flushCardNewsAnalytics: async (id) => {
        flushed.push(id);
      },
      dispatchPendingCardNewsJobs: async () => {
        for (const id of ids) await work(id);
      },
      recoverCardNewsJobs: async () => {
        for (const id of ids) await work(id);
      },
      cleanupPendingCardNewsAssets: async () => {
        for (const id of ids) await work(id);
      },
    };
    const entities = {
      listRecoverableCardNewsJobs: async () => ids.map((id) => ({ id })),
      listAssetCleanupJobs: async () => ids.map((id) => ({ id })),
      listPendingCardNewsAnalyticsJobs: async () => [{ id: "analytics-only" }],
    };
    const exports = {};
    const source = readFileSync(
      new URL("./card-news-functions.ts", import.meta.url),
      "utf8",
    );
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    vm.runInNewContext(compiled, {
      exports,
      require: (name) =>
        name === "./client"
          ? { inngest: { createFunction: (...args) => args.at(-1) } }
          : name.includes("entities")
            ? entities
            : features,
    });
    const completed = new Map();
    await exports[handler]({
      step: {
        run: async (id, fn) => {
          if (completed.has(id)) return completed.get(id);
          consumed = 0;
          const result = await fn();
          consumed = null;
          completed.set(id, result);
          return result;
        },
      },
    });
    assert.deepEqual(
      processed,
      ids,
      `${operation} must reach every queued job`,
    );
    assert.deepEqual(
      flushed,
      operation === "dispatch" ? ["analytics-only"] : [],
    );
  });
}
