import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(
  new URL("./maintenance-functions.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const DRAIN_EVENT = "maintenance/drain.requested";

// vm 안에서 만든 객체는 다른 realm의 프로토타입을 가져 deepEqual이 같은 값도 다르다고 판정한다.
const plain = (value) => JSON.parse(JSON.stringify(value));

// options: { throwOn: string[], wake: {wakeAt: Date, pastDueStreak} | null | undefined, planThrows }
function createEnv({ throwOn = [], wake, planThrows = false } = {}) {
  const calls = [];
  const drainSteps = [];
  const computeArgs = [];
  const pastDueFloorArgs = [];
  const sleepUntilCalls = [];
  const sleepCalls = [];
  const sentEvents = [];
  const order = [];
  const PAST_DUE_FLOOR_SENTINEL = 777_000;
  let captured;

  const drain = (name) => async ({ step }) => {
    calls.push(name);
    drainSteps.push(step);
    if (throwOn.includes(name)) throw new Error(`${name} drain failed`);
  };

  const stubs = {
    "./client": {
      inngest: {
        createFunction: (options, trigger, handler) => {
          captured = { options, trigger, handler };
          return handler;
        },
      },
    },
    "./card-news-functions": {
      drainCardNewsDispatch: drain("dispatch"),
      drainCardNewsRecovery: drain("recovery"),
      drainCardNewsCleanup: drain("cleanup"),
    },
    "./video-reservation-functions": {
      drainVideoReservations: drain("video"),
    },
    "./maintenance-schedule": {
      computeNextWake: (now, deadlines, previous) => {
        computeArgs.push({ previous: plain(previous) });
        if (planThrows) throw new Error("plan read failed");
        return wake === undefined ? null : wake;
      },
      pastDueFloorMs: (streak) => {
        pastDueFloorArgs.push(streak);
        return PAST_DUE_FLOOR_SENTINEL;
      },
    },
    "./maintenance-event": { MAINTENANCE_DRAIN_EVENT: DRAIN_EVENT },
  };
  const entities = {
    nextCardNewsJobWakeAt: async () => null,
    nextAssetCleanupWakeAt: async () => null,
    nextVideoReservationWakeAt: async () => null,
  };

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => {
      if (name in stubs) return stubs[name];
      if (name.includes("entities")) return entities;
      throw new Error(`unexpected import: ${name}`);
    },
  });

  const step = {
    run: async (id, fn) => {
      order.push(`run:${id}`);
      return fn();
    },
    sleepUntil: async (id, time) => {
      order.push("sleepUntil");
      sleepUntilCalls.push({ id, time });
    },
    sleep: async (id, ms) => {
      order.push("sleep");
      sleepCalls.push({ id, ms });
    },
    sendEvent: async (id, payload) => {
      order.push("sendEvent");
      sentEvents.push({ id, payload });
    },
  };

  return {
    handler: exports.maintenanceDrain,
    captured,
    calls,
    drainSteps,
    computeArgs,
    pastDueFloorArgs,
    PAST_DUE_FLOOR_SENTINEL,
    sleepUntilCalls,
    sleepCalls,
    sentEvents,
    order,
    step,
  };
}

test("runs the four drains in order, each with the same step tools", async () => {
  const env = createEnv({ wake: null });
  await env.handler({
    event: { name: "card-news/generate.requested", data: {} },
    step: env.step,
  });
  assert.deepEqual(env.calls, ["dispatch", "recovery", "cleanup", "video"]);
  assert.ok(env.drainSteps.every((s) => s === env.step));
});

test("a drain throwing does not stop the rest and marks drainFailed for the plan", async () => {
  const env = createEnv({
    throwOn: ["recovery"],
    wake: { wakeAt: new Date(10_000_000), pastDueStreak: 0 },
  });
  await env.handler({
    event: { name: "card-news/completed", data: {} },
    step: env.step,
  });
  assert.deepEqual(env.calls, ["dispatch", "recovery", "cleanup", "video"]);
  assert.equal(env.computeArgs.at(-1).previous.drainFailed, true);
});

test("a null plan sleeps nothing and returns idle", async () => {
  const env = createEnv({ wake: null });
  const result = await env.handler({
    event: { name: "card-news/render.requested", data: {} },
    step: env.step,
  });
  assert.deepEqual(plain(result), { idle: true });
  assert.equal(env.sleepUntilCalls.length, 0);
  assert.equal(env.sentEvents.length, 0);
});

test("a plan sleeps until its ISO wake then kicks the drain event with its streak", async () => {
  const wakeAt = new Date(10_000_000 + 123_456);
  const env = createEnv({ wake: { wakeAt, pastDueStreak: 4 } });
  const result = await env.handler({
    event: { name: "processing/attempt.claimed", data: {} },
    step: env.step,
  });
  assert.equal(env.sleepUntilCalls.length, 1);
  assert.equal(env.sleepUntilCalls[0].time, wakeAt.toISOString());
  assert.equal(env.sentEvents.length, 1);
  assert.deepEqual(plain(env.sentEvents[0].payload), {
    name: DRAIN_EVENT,
    data: { reason: "continue", pastDueStreak: 4 },
  });
  assert.ok(
    env.order.indexOf("sleepUntil") < env.order.indexOf("sendEvent"),
    "sleep happens before the continuation kick",
  );
  assert.deepEqual(plain(result), { continuedAt: wakeAt.toISOString() });
});

test("pastDueStreak is read only from the drain event, zero otherwise", async () => {
  const drainEnv = createEnv({
    wake: { wakeAt: new Date(10_000_000), pastDueStreak: 0 },
  });
  await drainEnv.handler({
    event: { name: DRAIN_EVENT, data: { pastDueStreak: 7 } },
    step: drainEnv.step,
  });
  assert.equal(drainEnv.computeArgs[0].previous.pastDueStreak, 7);

  const outerEnv = createEnv({
    wake: { wakeAt: new Date(10_000_000), pastDueStreak: 0 },
  });
  await outerEnv.handler({
    event: { name: "processing/attempt.claimed", data: { pastDueStreak: 7 } },
    step: outerEnv.step,
  });
  assert.equal(outerEnv.computeArgs[0].previous.pastDueStreak, 0);
});

test("a failed plan sleeps the past-due floor then kicks with streak + 1", async () => {
  const env = createEnv({ planThrows: true });
  const result = await env.handler({
    event: { name: DRAIN_EVENT, data: { pastDueStreak: 3 } },
    step: env.step,
  });
  assert.deepEqual(env.pastDueFloorArgs, [3]);
  assert.equal(env.sleepCalls.length, 1);
  assert.equal(env.sleepCalls[0].ms, env.PAST_DUE_FLOOR_SENTINEL);
  assert.equal(env.sentEvents.length, 1);
  assert.deepEqual(plain(env.sentEvents[0].payload), {
    name: DRAIN_EVENT,
    data: { reason: "plan-failed", pastDueStreak: 4 },
  });
  assert.deepEqual(plain(result), { planFailed: true });
});

test("the function has five event triggers, no cron, and singleton cancel", async () => {
  const env = createEnv({ wake: null });
  assert.equal(env.captured.trigger.length, 5);
  assert.ok(
    env.captured.trigger.every((t) => !("cron" in t)),
    "no cron trigger remains",
  );
  assert.deepEqual(
    plain(env.captured.trigger.map((t) => t.event)).sort(),
    [
      "card-news/completed",
      "card-news/generate.requested",
      "card-news/render.requested",
      DRAIN_EVENT,
      "processing/attempt.claimed",
    ].sort(),
  );
  assert.equal(env.captured.options.singleton.mode, "cancel");
});
