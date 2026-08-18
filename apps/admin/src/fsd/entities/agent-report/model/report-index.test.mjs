import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseReportIndex } from "./report-index.ts";

describe("parseReportIndex", () => {
  it("keeps only markdown files and drops the convention README", () => {
    const reports = parseReportIndex([
      { type: "file", name: "FEAT-12.md", size: 2048 },
      { type: "file", name: "README.md", size: 1200 }, // 규약 문서지 보고서가 아니다
      { type: "dir", name: "nested", size: 0 }, // 하위 디렉터리는 보고서가 아니다
      { type: "file", name: "notes.txt", size: 10 }, // md만 센다
    ]);

    assert.deepEqual(reports, [
      { name: "FEAT-12.md", label: "FEAT-12", size: 2048 },
    ]);
  });

  it("sorts deterministically by file name", () => {
    const reports = parseReportIndex([
      { type: "file", name: "FEAT-12.md", size: 1 },
      { type: "file", name: "BUG-07.md", size: 2 },
      { type: "file", name: "감사기록.md", size: 3 },
    ]);

    assert.deepEqual(
      reports.map((r) => r.label),
      ["BUG-07", "FEAT-12", "감사기록"],
    );
  });

  it("returns empty for a non-array response", () => {
    // contents API는 단일 파일 경로에 객체를 준다 — 디렉터리가 아니면 보고서 목록이 아니다.
    assert.deepEqual(parseReportIndex({ type: "file", name: "a.md" }), []);
    assert.deepEqual(parseReportIndex(null), []);
    assert.deepEqual(parseReportIndex(undefined), []);
  });

  it("fails closed on a malformed member instead of partially aggregating", () => {
    // 부분 집계는 "기록 N건"을 조용히 줄여 거짓 이력을 만든다.
    assert.deepEqual(
      parseReportIndex([
        { type: "file", name: "FEAT-12.md", size: 10 },
        { type: "file", name: "FEAT-13.md" }, // size 누락
      ]),
      [],
    );
    assert.deepEqual(
      parseReportIndex([
        { type: "file", name: "FEAT-12.md", size: 10 },
        { type: "file", size: 10 }, // name 누락
      ]),
      [],
    );
    assert.deepEqual(parseReportIndex([null]), []);
  });

  it("returns empty for an empty directory", () => {
    assert.deepEqual(parseReportIndex([]), []);
  });
});
