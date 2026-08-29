// 배포 확인 원장의 〔auto …〕 줄을 프로덕션 admin에서 판정하고(--apply면 원장 되쓰기) JSON 보고서를 남긴다.
// 사용: node --env-file=.env scripts/release-verify/run.mjs [--apply] [--report <path>] [--base <url>] [--ledger <path>]
// 종료코드: 0 실행 완료(개별 pass/fail/skip은 보고서) · 2 설정/로그인 실패(원장 무변경)
import { readFileSync, writeFileSync } from "node:fs";
import { applyResults, evaluateCheck, kstStamp, parseLedger, stylesheetHrefs } from "./ledger.mjs";
import { getText, getWithSession, loginVerifier } from "./http.mjs";

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const APPLY = args.includes("--apply");
const BASE = (opt("--base", process.env.ADMIN_BASE_URL) ?? "https://admin.a-pch.com").replace(/\/$/, "");
const LEDGER = opt("--ledger", "docs/release-checks.md");
const REPORT = opt("--report", null);
const BOARD_URL = process.env.BOARD_RAW_URL ?? "https://raw.githubusercontent.com/Sangeok/ApcH/dev/PROJECT_BOARD.md";

const markdown = readFileSync(LEDGER, "utf8");
const report = { base: BASE, ledger: LEDGER, stamp: kstStamp(new Date()), login: null, parse: null, results: [] };
let checks = [];

const finish = (code) => {
  if (REPORT) writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  const counts = { pass: 0, fail: 0, skip: 0 };
  for (const r of report.results) counts[r.outcome]++;
  console.log(`release-verify: login=${report.login?.ok ? "ok" : "FAILED"} pass=${counts.pass} fail=${counts.fail} skip=${counts.skip} of ${checks.length}`);
  for (const r of report.results) console.log(`  [${r.outcome}] ${r.section} — ${r.line.slice(6, 60)}… ${r.outcome === "pass" ? r.evidence : r.reason}`);
  process.exit(code);
};

// 태그 문법 오류는 원장 편집 실수다 — 스택 대신 사유를 보고서에 남기고 2로 끝낸다(원장 무변경).
try {
  checks = parseLedger(markdown.replace(/\r\n/g, "\n")).checks;
} catch (error) {
  report.parse = { ok: false, reason: error instanceof Error ? error.message : String(error) };
  console.log(`release-verify: 원장 태그 파싱 실패 — ${report.parse.reason}`);
  finish(2);
}
report.parse = { ok: true, checks: checks.length };

if (checks.length === 0) { report.login = { ok: true, skipped: "no checks" }; finish(0); }

const secret = process.env.VERIFIER_SECRET;
if (!secret) { report.login = { ok: false, step: "env", reason: "VERIFIER_SECRET 미설정" }; finish(2); }

const login = await loginVerifier(BASE, secret);
report.login = { ok: login.ok, step: login.step ?? "callback", status: login.status ?? 302 }; // 쿠키·비밀값은 싣지 않는다
if (!login.ok) finish(2);

const pages = new Map();
const cssCache = new Map();
let board;
for (const c of checks) {
  const t = c.tag;
  if (!pages.has(t.path)) pages.set(t.path, await getWithSession(BASE, t.path, login.cookie));
  const page = pages.get(t.path);
  const sheets = [];
  if (t.css.length) {
    for (const href of stylesheetHrefs(page.body)) {
      const url = href.startsWith("http") ? href : `${BASE}${href}`;
      if (!cssCache.has(url)) cssCache.set(url, (await getText(url)) ?? "");
      sheets.push(cssCache.get(url));
    }
  }
  if (t.whenBoard.length && board === undefined) board = await getText(BOARD_URL);
  const r = evaluateCheck(t, page, sheets, board ?? null);
  report.results.push({ index: c.index, section: c.section, line: c.line, ...r });
}

if (APPLY) {
  const next = applyResults(markdown.replace(/\r\n/g, "\n"), report.results, report.stamp);
  if (next !== markdown.replace(/\r\n/g, "\n")) writeFileSync(LEDGER, next);
}
finish(0);
