import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load(relativePath, imports) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports,
    require: (name) => imports[name] ?? {},
    console,
  });
  return exports;
}

for (const name of ["processVideo", "analyzeVideo"]) {
  test(`${name}: a closed gate prevents a new claim, while a cached claim can finish`, async () => {
    let enabled = false;
    let starts = 0;
    const started = new Error("reached the existing claim");
    const resumed = new Error("resumed after the cached claim");
    const functions = load("./functions.ts", {
      "./client": { inngest: { createFunction: (...args) => args.at(-1) } },
      "~/fsd/shared/config/processing-admission": {
        isVideoWorkerStartEnabled: () => enabled,
      },
      "~/fsd/entities/uploaded-file/server": {
        findCurrentProcessingAttemptContext: async () => ({
          status: "queued",
          s3Key: "source.mp4",
          userId: "user",
          user: { credits: 10 },
        }),
        startUploadedFileProcessingAttempt: async () => {
          starts++;
          throw started;
        },
      },
      "~/fsd/shared/api/s3": { objectExists: async () => true },
    });
    const event = {
      data: { uploadedFileId: "upload", attempt: 1, clipCount: 1 },
    };
    const step = { run: async (_id, fn) => fn() };
    await assert.rejects(
      functions[name]({ event, step }),
      /worker starts are temporarily paused/,
    );
    assert.equal(starts, 0);
    enabled = true;
    await assert.rejects(
      functions[name]({ event, step }),
      (error) => error === started,
    );
    assert.equal(starts, 1);
    enabled = false;
    await assert.rejects(
      functions[name]({
        event,
        step: {
          run: async (id, fn) =>
            id === "claim-processing-attempt" ? { status: "started" } : fn(),
          sendEvent: async () => {
            throw resumed;
          },
        },
      }),
      (error) => error === resumed,
    );
    assert.equal(starts, 1);
  });
}

test("closed admission refuses a new upload before creating a draft or URL", async () => {
  const actions = load("../fsd/features/upload/api/index.ts", {
    "~/fsd/shared/api/auth-guard": {
      requireAuth: async () => ({ success: true, data: { userId: "user" } }),
    },
    "~/fsd/shared/api/result": {
      failure: (error) => ({ success: false, error }),
    },
    "~/fsd/shared/config/processing-admission": {
      isVideoGenerationAdmissionEnabled: () => false,
    },
  });
  const result = await actions.prepareUpload({});
  assert.equal(result.success, false);
  assert.match(result.error, /temporarily unavailable/);
});

test("closed admission refuses scheduling before opening a transaction", async () => {
  const actions = load("../fsd/features/upload/api/index.ts", {
    "~/fsd/shared/api/auth-guard": {
      requireAuth: async () => ({ success: true, data: { userId: "user" } }),
    },
    "~/fsd/shared/api/result": {
      failure: (error) => ({ success: false, error }),
    },
    "~/fsd/shared/config/processing-admission": {
      isVideoGenerationAdmissionEnabled: () => false,
    },
    "../model/schemas": {
      scheduleUploadedFileProcessingSchema: {
        safeParse: (data) => ({ success: true, data }),
      },
    },
  });
  const result = await actions.scheduleUploadedFileProcessing("upload");
  assert.equal(result.success, false);
  assert.match(result.error, /temporarily unavailable/);
});
