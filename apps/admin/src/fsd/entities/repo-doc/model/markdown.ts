// 인라인 코드 자리를 표시하는 구분자. 원문 NUL은 먼저 U+FFFD로 정규화한 뒤
// 자리표시자를 삽입해 평문과 충돌하지 않게 한다 — 공백-숫자-공백(" 0 ") 자리표시자는
// "결함 0 건" 같은 평문을 코드 복원 단계에서 조용히 삭제한다("결함 0 건"→"결함건",
// 검증 라운드 실행 실측).
const CODE_SLOT = String.fromCharCode(0);
const CODE_SLOT_RE = new RegExp(`${CODE_SLOT}(\\d+)${CODE_SLOT}`, "g");

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 인라인: 코드 → escape → 링크 → 볼드 → 이탤릭 → 코드 복원. */
export function renderInline(text: string): string {
  const codes: string[] = [];
  let s = text.replaceAll(CODE_SLOT, "�").replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(`<code>${escapeHtml(c)}</code>`);
    return `${CODE_SLOT}${codes.length - 1}${CODE_SLOT}`;
  });
  s = escapeHtml(s);
  // 링크: http(s)·단일 슬래시 루트상대(/)만 허용. //host·javascript:는 평문으로 둔다.
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label: string, url: string) => {
    if (!/^https?:\/\//.test(url) && !/^\/(?!\/)/.test(url)) return m;
    return `<a href="${url}" target="_blank" rel="noreferrer noopener">${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  return s.replace(CODE_SLOT_RE, (_m, i: string) => codes[Number(i)] ?? "");
}

/** 블록 스캐너: 코드펜스·제목·hr·인용·GFM 표·목록·문단. */
export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  const para: string[] = [];
  const flush = () => {
    if (para.length > 0) {
      out.push(`<p>${renderInline(para.join(" "))}</p>`);
      para.length = 0;
    }
  };
  // GFM은 셀 안의 리터럴 파이프를 `\|`로 이스케이프한다. 비이스케이프 파이프에서만
  // 쪼갠 뒤 셀 안에서 되돌린다. 이 저장소의 계획서가 실제로 이 문법을 쓴다 —
  // 순진하게 split("|")하면 BUG-05·FEAT-06·FEAT-13의 표 5행이 열이 밀려 렌더된다
  // (검증 라운드에서 실측: 표 148행 중 5행 파손, 수정 후 0행·회귀 0).
  // 끝 파이프 제거도 이스케이프를 봐야 한다 — 안 그러면 `...\|`로 끝나는 행에서
  // 파이프만 떨어져 나가고 역슬래시가 남는다.
  const splitRow = (row: string) =>
    row
      .replace(/^\s*\|/, "")
      .replace(/(?<!\\)\|\s*$/, "")
      .split(/(?<!\\)\|/)
      .map((c) => c.trim().replaceAll("\\|", "|"));

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";

    // 정규식이 아니라 startsWith/includes를 쓰는 이유는 취향이 아니라 게이트다 —
    // `/^\`\`\`/.test(line)`·`/-/.test(next)`는 stylisticTypeChecked의
    // prefer-string-starts-ends-with·prefer-includes에 걸려 `check`의 lint 0 기준을 깬다
    // (검증 라운드에서 실제 ESLint 실행으로 확인. 동작은 동일 — 문서 18개 421KB 출력 바이트 일치).
    if (line.startsWith("```")) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) { body.push(lines[i] ?? ""); i++; }
      i++; // 닫는 ```
      out.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = (heading[1] ?? "#").length;
      out.push(`<h${level}>${renderInline((heading[2] ?? "").trim())}</h${level}>`);
      i++; continue;
    }
    if (/^(---+|\*\*\*+|___+)\s*$/.test(line)) { flush(); out.push("<hr />"); i++; continue; }
    if (/^>\s?/.test(line)) {
      flush();
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? "")) { body.push((lines[i] ?? "").replace(/^>\s?/, "")); i++; }
      out.push(`<blockquote>${renderInline(body.join(" "))}</blockquote>`);
      continue;
    }
    // GFM 표: 헤더 + 구분행(| --- | --- |)
    const next = lines[i + 1] ?? "";
    if (line.includes("|") && next.includes("-") && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(next)) {
      flush();
      const headers = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").includes("|") && (lines[i] ?? "").trim() !== "") {
        rows.push(splitRow(lines[i] ?? "")); i++;
      }
      const thead = `<thead><tr>${headers.map((h) => `<th>${renderInline(h)}</th>`).join("")}</tr></thead>`;
      const tbody = `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${renderInline(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
      out.push(`<table>${thead}${tbody}</table>`);
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i] ?? "")) { items.push((lines[i] ?? "").replace(/^\s*[-*+]\s+/, "")); i++; }
      out.push(`<ul>${items.map((it) => `<li>${renderInline(it)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? "")) { items.push((lines[i] ?? "").replace(/^\s*\d+\.\s+/, "")); i++; }
      out.push(`<ol>${items.map((it) => `<li>${renderInline(it)}</li>`).join("")}</ol>`);
      continue;
    }
    if (line.trim() === "") { flush(); i++; continue; }
    para.push(line.trim());
    i++;
  }
  flush();
  return out.join("\n");
}
