import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, access, writeFile, unlink } from "node:fs/promises";
import net from "node:net";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Offline verification only: an ephemeral cluster and fixed-target loopback proxy.
// No production URL, credential, PostgreSQL service or database is reused.
const binDirectory = process.env.CARD_NEWS_TEST_POSTGRES_BIN;
assert.ok(
  binDirectory,
  "Set CARD_NEWS_TEST_POSTGRES_BIN to a PostgreSQL bin directory",
);
const executable = (name: string) =>
  path.resolve(
    binDirectory,
    `${name}${process.platform === "win32" ? ".exe" : ""}`,
  );
for (const name of ["initdb", "postgres", "pg_ctl", "createdb", "psql"])
  await access(executable(name));

const workspace = path.resolve(import.meta.dirname, "../../..");
const webDirectory = path.join(workspace, "apps/web");
const taskDirectory = await mkdtemp(
  path.join(os.tmpdir(), "apch-card-news-db-"),
);
const dataDirectory = path.join(taskDirectory, "data");
const passwordFile = path.join(taskDirectory, "password");
const password = randomBytes(24).toString("hex");
const cleanEnvironment = { ...process.env };
delete cleanEnvironment.DATABASE_URL;
delete cleanEnvironment.DATABASE_URL_UNPOOLED;
const environment = { ...cleanEnvironment, PGPASSWORD: password };

async function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = environment,
  cwd = webDirectory,
) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Verification process exited ${code}`)),
    );
  });
}

async function unusedPort() {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

const require = createRequire(import.meta.url);
// Already supplied by Next; no downloaded server package is executed by the runner.
const {
  WebSocketServer,
  createWebSocketStream,
} = require("next/dist/compiled/ws");
const pgPort = await unusedPort();
const wsPort = await unusedPort();
const proxy = new WebSocketServer({ host: "127.0.0.1", port: wsPort });
const sockets = new Set<net.Socket>();
proxy.on(
  "connection",
  (socket: Parameters<typeof createWebSocketStream>[0]) => {
    const stream = createWebSocketStream(socket);
    const tcp = net.connect({ host: "127.0.0.1", port: pgPort });
    sockets.add(tcp);
    tcp.on("close", () => sockets.delete(tcp));
    tcp.on("error", () => stream.destroy());
    stream.on("error", () => tcp.destroy());
    stream.on("close", () => tcp.destroy());
    tcp.pipe(stream).pipe(tcp);
  },
);

let postgres: ReturnType<typeof spawn> | undefined;
let startupLog = "";
try {
  await writeFile(passwordFile, password, { mode: 0o600 });
  await run(executable("initdb"), [
    "-D",
    dataDirectory,
    "-U",
    "card_news_test",
    "--auth=scram-sha-256",
    "--encoding=UTF8",
    "--locale=C",
    `--pwfile=${passwordFile}`,
  ]);
  await unlink(passwordFile);
  postgres = spawn(
    executable("postgres"),
    ["-D", dataDirectory, "-h", "127.0.0.1", "-p", String(pgPort)],
    { env: environment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  postgres.stdout?.on("data", (chunk) => (startupLog += String(chunk)));
  postgres.stderr?.on("data", (chunk) => (startupLog += String(chunk)));
  postgres.on("error", (error) => (startupLog += error.message));
  let ready = false;
  for (let attempt = 0; attempt < 100 && !ready; attempt += 1) {
    ready = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ host: "127.0.0.1", port: pgPort });
      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
    });
    if (!ready) await delay(100);
  }
  assert.ok(ready, `Isolated PostgreSQL did not start: ${startupLog}`);
  await run(executable("createdb"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(pgPort),
    "-U",
    "card_news_test",
    "card_news_verify",
  ]);
  const databaseUrl = `postgresql://card_news_test:${password}@127.0.0.1:${pgPort}/card_news_verify`;
  const migratedEnvironment = {
    ...environment,
    DATABASE_URL: databaseUrl,
    DATABASE_URL_UNPOOLED: databaseUrl,
  };
  // Legacy migrations do not create ClipDraft/ProcessingDispatch. Rehearse the
  // additive change against the frozen pre-feature schema instead of silently
  // repairing or rewriting already-deployed migration history.
  const baselineRef = "b20722b194f4a5014423e7790dfa188cb9cca367";
  const baselineSchema = path.join(taskDirectory, "baseline.prisma");
  const baselineSql = path.join(taskDirectory, "baseline.sql");
  await writeFile(
    baselineSchema,
    execFileSync(
      "git",
      ["show", `${baselineRef}:packages/db/prisma/schema.prisma`],
      {
        cwd: workspace,
        encoding: "utf8",
        windowsHide: true,
      },
    ),
  );
  await run(
    process.execPath,
    [
      path.join(workspace, "node_modules/prisma/build/index.js"),
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema-datamodel",
      baselineSchema,
      "--script",
      "--output",
      baselineSql,
    ],
    migratedEnvironment,
    workspace,
  );
  const legacyChecks = path.join(taskDirectory, "legacy-checks.sql");
  await writeFile(
    legacyChecks,
    'ALTER TABLE "User" ADD CONSTRAINT "User_defaultVideoPaddingPercent_check" CHECK ("defaultVideoPaddingPercent" BETWEEN 0 AND 25);\n' +
      'ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_videoPaddingPercent_check" CHECK ("videoPaddingPercent" BETWEEN 0 AND 25);\n',
  );
  for (const sqlFile of [
    baselineSql,
    legacyChecks,
    path.join(
      workspace,
      "packages/db/prisma/migrations/20260630000000_one_processing_per_user_index/migration.sql",
    ),
    path.join(
      workspace,
      "packages/db/prisma/migrations/20261011000000_card_news_credit_reservations/migration.sql",
    ),
  ])
    await run(executable("psql"), [
      "-h",
      "127.0.0.1",
      "-p",
      String(pgPort),
      "-U",
      "card_news_test",
      "-d",
      "card_news_verify",
      "-v",
      "ON_ERROR_STOP=1",
      "--single-transaction",
      "--quiet",
      "-f",
      sqlFile,
    ]);
  console.log(
    `Card news additive migration applied to frozen schema ${baselineRef}`,
  );
  const testEnvironment = {
    ...cleanEnvironment,
    CARD_NEWS_TEST_DATABASE_URL: databaseUrl,
    CARD_NEWS_TEST_DATABASE_CONFIRMED: "true",
    CARD_NEWS_TEST_LOCAL_WS_PROXY: `ws://127.0.0.1:${wsPort}`,
  };
  for (const script of [
    "verify-card-news-credit-concurrency.mts",
    "verify-card-news-lifecycle.mts",
    "verify-card-news-video-compatibility.mts",
  ])
    await run(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", `scripts/${script}`],
      testEnvironment,
    );
  console.log("All isolated PostgreSQL card news integration checks passed");
} finally {
  for (const socket of sockets) socket.destroy();
  for (const client of proxy.clients) client.terminate();
  await new Promise<void>((resolve) => proxy.close(() => resolve()));
  if (postgres && postgres.exitCode === null)
    await run(executable("pg_ctl"), [
      "-D",
      dataDirectory,
      "-m",
      "fast",
      "-w",
      "stop",
    ]);
  await writeFile(path.join(taskDirectory, "postgres.log"), startupLog);
  console.log(`Isolated test artifacts: ${taskDirectory}`);
}
