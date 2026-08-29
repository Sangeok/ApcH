import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyResults,
  cssEscape,
  evaluateCheck,
  FAIL_NOTE_PREFIX,
  hasSelector,
  kstStamp,
  parseLedger,
  parseTag,
  preconditionsMet,
  stylesheetHrefs,
} from "./ledger.mjs";

describe("cssEscape / hasSelector", () => {
  it("escapes Tailwind v4 special characters", () => {
    assert.equal(cssEscape("border-active/50"), "border-active\\/50");
    assert.equal(cssEscape("pl-[30.3%]"), "pl-\\[30\\.3\\%\\]");
    assert.equal(cssEscape("hover:text-stamp"), "hover\\:text-stamp");
    assert.equal(cssEscape("size-2.5"), "size-2\\.5");
    assert.equal(cssEscape("bg-active"), "bg-active");
  });
  it("finds escaped selectors and rejects prefix collisions", () => {
    const css = ".hidden-x{display:none}.border-active\\/50{border-color:red}.hover\\:text-stamp:hover{color:red}";
    assert.equal(hasSelector(css, "border-active/50"), true);
    assert.equal(hasSelector(css, "hover:text-stamp"), true);
    assert.equal(hasSelector(css, "hidden"), false);
    assert.equal(hasSelector(css, "bg-silence"), false);
  });
});

describe("parseTag", () => {
  it("parses every key and keeps quoted values intact", () => {
    const t = parseTag('GET /pipeline status=200 text="지금 " text="· 다음 " notext="최대 5분" css="bg-silence,bg-active" when="진행할 작업 없음" when-any="당신 차례|검증 중" when-board="status: (승인대기|검토대기)"');
    assert.equal(t.method, "GET");
    assert.equal(t.path, "/pipeline");
    assert.equal(t.status, 200);
    assert.deepEqual(t.text, ["지금 ", "· 다음 "]);
    assert.deepEqual(t.notext, ["최대 5분"]);
    assert.deepEqual(t.css, ["bg-silence", "bg-active"]);
    assert.deepEqual(t.when, ["진행할 작업 없음"]);
    assert.deepEqual(t.whenAny, [["당신 차례", "검증 중"]]);
    assert.deepEqual(t.whenBoard, ["status: (승인대기|검토대기)"]);
  });
  it("defaults status to 200 and accepts bare status", () => {
    assert.equal(parseTag("GET /x").status, 200);
    assert.equal(parseTag("GET /x status=404").status, 404);
  });
  it("throws on unknown keys, non-GET, and missing path", () => {
    assert.throws(() => parseTag('GET /x bogus="1"'), /unknown key: bogus/);
    assert.throws(() => parseTag("POST /x"), /unsupported method/);
    assert.throws(() => parseTag("GET"), /missing path/);
    assert.throws(() => parseTag("GET /x extra"), /unexpected token/);
  });
});

const LEDGER = [
  "## 규칙",
  "- [x] 닫힌 줄 〔auto GET /a〕",
  "## FEAT-23 — 스테퍼",
  "- [ ] 태그 없음",
  '- [ ] 캡션 〔auto GET /pipeline text="지금 " when-any="당신 차례|작업 중"〕',
  "## FEAT-22 — 문구",
  '- [ ] 게이트대기 〔auto GET /pipeline text="결재함 항목에" when="진행할 작업 없음" when-board="status: (승인대기|검토대기)"〕',
  '- [ ] 방출 〔auto GET /pipeline css="bg-active,flex-wrap"〕',
  "",
].join("\n");

describe("parseLedger", () => {
  it("collects only open tagged lines with their section", () => {
    const { checks } = parseLedger(LEDGER);
    assert.deepEqual(checks.map((c) => [c.index, c.section]), [[4, "FEAT-23 — 스테퍼"], [6, "FEAT-22 — 문구"], [7, "FEAT-22 — 문구"]]);
  });
  it("throws on an unterminated tag", () => {
    assert.throws(() => parseLedger("- [ ] x 〔auto GET /a"), /unterminated/);
  });
});

describe("stylesheetHrefs", () => {
  it("keeps stylesheet links in order without duplicates and ignores preload", () => {
    const html = '<link rel="preload" href="/a.css" as="style"><link rel="stylesheet" href="/_next/static/css/x.css"><link href="/y.css" rel="stylesheet"><link rel="stylesheet" href="/_next/static/css/x.css">';
    assert.deepEqual(stylesheetHrefs(html), ["/_next/static/css/x.css", "/y.css"]);
  });
});

describe("preconditionsMet / evaluateCheck", () => {
  const page = { status: 200, body: "<p>지금 A · 다음 B</p><span>당신 차례</span>진행할 작업 없음 결재함 항목에" };
  it("skips when `when` text is missing", () => {
    const t = parseTag('GET /pipeline when="없는 문구"');
    assert.deepEqual(evaluateCheck(t, page, [], null).outcome, "skip");
  });
  it("proceeds when any alternative matches", () => {
    const t = parseTag('GET /pipeline text="지금 " when-any="선정 중|당신 차례"');
    assert.equal(evaluateCheck(t, page, [], null).outcome, "pass");
  });
  it("skips when board is missing or regex does not match, proceeds when it matches", () => {
    const t = parseTag('GET /pipeline text="지금 " when-board="status: 검토대기"');
    assert.equal(preconditionsMet(t, page, null).met, false);
    assert.equal(evaluateCheck(t, page, [], "status: 완료").outcome, "skip");
    assert.equal(evaluateCheck(t, page, [], "  status: 검토대기\n").outcome, "pass");
  });
  it("fails with reasons for status, text, notext and css", () => {
    const t = parseTag('GET /pipeline status=200 text="없다" notext="지금 " css="bg-active"');
    const r = evaluateCheck(t, { status: 307, body: page.body }, [".bg-silence{}"], null);
    assert.equal(r.outcome, "fail");
    assert.match(r.reason, /status 307≠200/);
    assert.match(r.reason, /text 없음: "없다"/);
    assert.match(r.reason, /notext 존재: "지금 "/);
    assert.match(r.reason, /css 미방출: bg-active/);
  });
  it("passes with an evidence string in the documented shape", () => {
    const t = parseTag('GET /pipeline text="지금 " text="다음 " css="bg-active,flex-wrap"');
    const r = evaluateCheck(t, page, [".bg-active{}", ".flex-wrap{}"], null);
    assert.equal(r.outcome, "pass");
    assert.equal(r.evidence, "GET /pipeline 200 · text 2/2 · css 2/2");
  });
});

describe("applyResults", () => {
  const stamp = "2026-08-29 09:00 KST";
  it("closes a pass line, removes the tag and keeps other lines byte-identical", () => {
    const out = applyResults(LEDGER, [{ index: 7, outcome: "pass", evidence: "GET /pipeline 200 · css 2/2", reason: "" }], stamp);
    const lines = out.split("\n");
    assert.equal(lines[7], "- [x] 방출 — 확인(2026-08-29 09:00 KST, 자동 — GET /pipeline 200 · css 2/2)");
    assert.deepEqual(lines.filter((_, i) => i !== 7), LEDGER.split("\n").filter((_, i) => i !== 7));
  });
  it("adds a fail note once and is idempotent for the same reason", () => {
    const results = [{ index: 6, outcome: "fail", evidence: "", reason: 'text 없음: "결재함 항목에"' }];
    const once = applyResults(LEDGER, results, stamp);
    const twice = applyResults(once, results, stamp);
    assert.equal(once.split("\n")[7], `${FAIL_NOTE_PREFIX}${stamp}): text 없음: "결재함 항목에"`);
    assert.equal(twice, once);
    const other = applyResults(once, [{ index: 6, outcome: "fail", evidence: "", reason: "status 307≠200" }], stamp);
    assert.equal(other.split("\n").filter((l) => l.startsWith(FAIL_NOTE_PREFIX)).length, 2);
  });
  it("applies bottom-up so a fail note never shifts a following pass line", () => {
    const out = applyResults(LEDGER, [
      { index: 6, outcome: "fail", evidence: "", reason: "r" },
      { index: 7, outcome: "pass", evidence: "GET /pipeline 200 · css 2/2", reason: "" },
    ], stamp);
    const lines = out.split("\n");
    assert.equal(lines[7], `${FAIL_NOTE_PREFIX}${stamp}): r`);
    assert.equal(lines[8], "- [x] 방출 — 확인(2026-08-29 09:00 KST, 자동 — GET /pipeline 200 · css 2/2)");
    assert.equal(lines.length, LEDGER.split("\n").length + 1);
  });
  it("leaves skip untouched and keeps indices stable across multiple results", () => {
    const out = applyResults(LEDGER, [
      { index: 4, outcome: "pass", evidence: "GET /pipeline 200 · text 1/1", reason: "" },
      { index: 6, outcome: "fail", evidence: "", reason: "r" },
      { index: 7, outcome: "skip", evidence: "", reason: "when 미충족" },
    ], stamp);
    const lines = out.split("\n");
    assert.match(lines[4], /^- \[x\] 캡션 — 확인\(/);
    assert.equal(lines[7], `${FAIL_NOTE_PREFIX}${stamp}): r`);
    assert.equal(lines[8], '- [ ] 방출 〔auto GET /pipeline css="bg-active,flex-wrap"〕');
  });
});

describe("kstStamp", () => {
  it("rolls the date across midnight KST", () => {
    assert.equal(kstStamp(new Date("2026-08-28T15:00:00Z")), "2026-08-29 00:00 KST");
    assert.equal(kstStamp(new Date("2026-08-28T03:29:33Z")), "2026-08-28 12:29 KST");
  });
});
