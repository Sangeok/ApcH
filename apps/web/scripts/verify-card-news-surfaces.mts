import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve("../..");
const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8");
const files = (directory: string): string[] =>
  fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? files(path.join(directory, entry.name))
        : [path.join(directory, entry.name)],
    );
const server = read("apps/web/src/fsd/features/card-news/server.ts");
for (const symbol of [
  "acceptCardNewsCallback",
  "claimCardNewsJob",
  "reconcileCardNewsJob",
  "dispatchPendingCardNewsJobs",
  "recoverCardNewsJobs",
  "cleanupPendingCardNewsAssets",
])
  assert.ok(server.includes(symbol), `Missing server orchestration ${symbol}`);
const actions = read("apps/web/src/fsd/features/card-news/api/index.ts");
assert.ok(actions.startsWith('"use server"'));
for (const symbol of [
  "createCardNews",
  "regenerateCardNews",
  "saveCardNews",
  "retryCardNews",
  "exportCardNews",
  "deleteCardNews",
])
  assert.ok(actions.includes(`async function ${symbol}`));
const client = read("apps/web/src/fsd/features/card-news/index.ts");
assert.ok(
  !/runtime-dependencies|job-lifecycle|reservation-tx|cleanupPending|sourceSnapshot|env/.test(
    client,
  ),
);
const serve = read("apps/web/src/app/api/inngest/route.ts");
for (const symbol of [
  "processVideo",
  "analyzeVideo",
  "cleanupAnalyticsEvents",
  "watchProcessingAttempt",
  "generateCardNews",
  "renderCardNews",
  "dispatchPendingCardNews",
  "reconcileCardNewsJobs",
  "cleanupCardNewsAssets",
  "reconcileVideoCreditReservations",
])
  assert.ok(serve.includes(symbol), `Missing served worker ${symbol}`);
const schema = JSON.parse(
  read("packages/db/contracts/card-news-v1.schema.json"),
) as { $defs: Record<string, unknown> };
for (const definition of [
  "input",
  "source",
  "draft",
  "callback",
  "manifest",
  "producerStatusRequest",
  "producerStatusResponse",
])
  assert.ok(
    schema.$defs[definition],
    `Missing canonical definition ${definition}`,
  );
const oldWorker = ts.createSourceFile(
  "functions.ts",
  read("apps/web/src/inngest/functions.ts"),
  ts.ScriptTarget.Latest,
  true,
);
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name)
    assert.ok(
      !["findAttemptGeneratedClipKeys", "persistGeneratedClips"].includes(
        node.name.text,
      ),
    );
  ts.forEachChild(node, visit);
}
visit(oldWorker);
assert.ok(
  !read("apps/web/src/inngest/functions.ts").includes(
    "decrementUserCreditsFloorZero",
  ),
);
const billing = files(
  path.join(root, "apps/web/src/fsd/features/billing"),
).filter((file) => /\.tsx?$/.test(file));
for (const file of billing)
  assert.ok(
    !fs.readFileSync(file, "utf8").includes("~/fsd/features/credit-balance"),
    "Billing imports a peer feature",
  );
for (const file of ["contract.py", "prompt.py", "layout.py"])
  assert.ok(
    !/(?:^|\n)(?:from|import)\s+(?:modal|boto3|PIL|torch|whisperx)\b/.test(
      read(`apps/backend/card_news/${file}`),
    ),
    `Pure CPU module imports I/O: ${file}`,
  );
assert.ok(
  !/(?:from|import)\s+(?:main|torch|whisperx|asd)\b/.test(
    read("apps/backend/card_news_app.py"),
  ),
);
assert.ok(
  read("apps/web/src/fsd/entities/processing-dispatch/api/index.ts").includes(
    'modalSpawnState: "not_sent"',
  ),
);
assert.ok(
  read("apps/web/src/fsd/features/upload/server.ts").includes(
    "recordLegacyProducerDrain",
  ),
);
assert.ok(
  read("apps/web/src/app/dashboard/billing/page.tsx").includes(
    "creditBalanceSlot",
  ),
);
assert.ok(
  !read("apps/web/src/fsd/entities/uploaded-file/model/types.ts").includes(
    "currentUserCredits",
  ),
);
console.log(
  "Card news surface contracts, registered workers, public boundaries, canonical schema and preserved video owners passed",
);
