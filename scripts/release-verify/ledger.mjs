// 배포 확인 원장(docs/release-checks.md)의 〔auto …〕 태그를 읽고, 판정하고, 되써 준다.
// I/O 없음 — 문자열만 받고 문자열만 돌려준다. 실행기(run.mjs)가 fetch를 맡는다.

export const TAG_OPEN = "〔auto ";
export const TAG_CLOSE = "〕";
const KNOWN_KEYS = new Set(["status", "text", "notext", "css", "when", "when-any", "when-board"]);

// Tailwind v4가 선택자에서 이스케이프하는 문자. `.border-active\/50` `.pl-\[30\.3\%\]` `.hover\:text-stamp`
export function cssEscape(cls) {
  return cls.replace(/[/.:%[\]#()]/g, (ch) => "\\" + ch);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 방출 여부: `.escaped` 뒤에 식별자 문자가 이어지지 않아야 한다(`.hidden`이 `.hidden-x`에 걸리지 않게).
export function hasSelector(css, cls) {
  const re = new RegExp("\\." + escapeRegExp(cssEscape(cls)) + "(?![A-Za-z0-9_-])");
  return re.test(css);
}

// `GET /pipeline status=200 text="a" text="b" css="x,y" when="z" when-any="p|q" when-board="re"`
export function parseTag(body) {
  const tag = {
    method: null, path: null, status: 200,
    text: [], notext: [], css: [], when: [], whenAny: [], whenBoard: [],
  };
  const re = /([\w-]+)="([^"]*)"|([\w-]+)=(\S+)|(\S+)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const key = m[1] ?? m[3];
    const value = m[1] !== undefined ? m[2] : m[4];
    if (key === undefined) {
      if (tag.method === null) tag.method = m[5];
      else if (tag.path === null) tag.path = m[5];
      else throw new Error(`unexpected token: ${m[5]}`);
      continue;
    }
    if (!KNOWN_KEYS.has(key)) throw new Error(`unknown key: ${key}`);
    if (key === "status") tag.status = Number(value);
    else if (key === "css") tag.css.push(...value.split(",").map((s) => s.trim()).filter(Boolean));
    else if (key === "when-any") tag.whenAny.push(value.split("|").filter(Boolean));
    else if (key === "when-board") tag.whenBoard.push(value);
    else tag[key].push(value);
  }
  if (tag.method !== "GET") throw new Error(`unsupported method: ${tag.method}`);
  if (tag.path === null || !tag.path.startsWith("/")) throw new Error(`missing path`);
  if (!Number.isInteger(tag.status)) throw new Error(`bad status`);
  return tag;
}

// 원장 전체에서 열린 줄(`- [ ] `)의 태그를 모은다. 절 제목은 근거 문구에 쓴다.
export function parseLedger(markdown) {
  const lines = markdown.split("\n");
  const checks = [];
  let section = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) section = line.slice(3).trim();
    if (!line.startsWith("- [ ] ")) continue;
    const start = line.indexOf(TAG_OPEN);
    if (start < 0) continue;
    const end = line.indexOf(TAG_CLOSE, start);
    if (end < 0) throw new Error(`unterminated tag at line ${i + 1}`);
    const body = line.slice(start + TAG_OPEN.length, end).trim();
    checks.push({ index: i, section, line, tag: parseTag(body) });
  }
  return { lines, checks };
}

// 본문에서 스타일시트 href를 뽑는다(순서 유지·중복 제거).
export function stylesheetHrefs(html) {
  const out = [];
  const re = /<link\b[^>]*>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const el = m[0];
    if (!/rel="stylesheet"/.test(el)) continue;
    const href = /href="([^"]+)"/.exec(el)?.[1];
    if (href && !out.includes(href)) out.push(href);
  }
  return out;
}

// 전제 조건. page: { body }, board: string | null
export function preconditionsMet(tag, page, board) {
  for (const t of tag.when) if (!page.body.includes(t)) return { met: false, reason: `when 미충족: "${t}"` };
  for (const alts of tag.whenAny) {
    if (!alts.some((t) => page.body.includes(t))) return { met: false, reason: `when-any 미충족: ${alts.join("|")}` };
  }
  for (const re of tag.whenBoard) {
    if (board === null) return { met: false, reason: "when-board: 보드 원문 없음" };
    if (!new RegExp(re).test(board)) return { met: false, reason: `when-board 미충족: /${re}/` };
  }
  return { met: true, reason: "" };
}

// 판정. page: { status, body }, stylesheets: string[](css 본문들), board: string | null
export function evaluateCheck(tag, page, stylesheets, board) {
  const pre = preconditionsMet(tag, page, board);
  if (!pre.met) return { outcome: "skip", evidence: "", reason: pre.reason };
  const problems = [];
  if (page.status !== tag.status) problems.push(`status ${page.status}≠${tag.status}`);
  const textHit = tag.text.filter((t) => page.body.includes(t));
  for (const t of tag.text) if (!page.body.includes(t)) problems.push(`text 없음: "${t}"`);
  for (const t of tag.notext) if (page.body.includes(t)) problems.push(`notext 존재: "${t}"`);
  const cssHit = tag.css.filter((cls) => stylesheets.some((css) => hasSelector(css, cls)));
  for (const cls of tag.css) if (!cssHit.includes(cls)) problems.push(`css 미방출: ${cls}`);
  const parts = [`${tag.method} ${tag.path} ${page.status}`];
  if (tag.text.length) parts.push(`text ${textHit.length}/${tag.text.length}`);
  if (tag.notext.length) parts.push(`notext ${tag.notext.length - problems.filter((p) => p.startsWith("notext")).length}/${tag.notext.length}`);
  if (tag.css.length) parts.push(`css ${cssHit.length}/${tag.css.length}`);
  const evidence = parts.join(" · ");
  if (problems.length) return { outcome: "fail", evidence, reason: problems.join("; ") };
  return { outcome: "pass", evidence, reason: "" };
}

// KST 날짜·시각 문자열. now: Date
export function kstStamp(now) {
  const t = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())} KST`;
}

function stripTag(line) {
  const start = line.indexOf(TAG_OPEN);
  const end = line.indexOf(TAG_CLOSE, start) + TAG_CLOSE.length;
  return (line.slice(0, start) + line.slice(end)).replace(/\s+$/, "");
}

export const FAIL_NOTE_PREFIX = "  - 자동 불합격(";

// results: [{ index, outcome, evidence, reason }] — 아래에서 위로 적용해 인덱스가 밀리지 않게 한다.
export function applyResults(markdown, results, stamp) {
  const lines = markdown.split("\n");
  const sorted = [...results].sort((a, b) => b.index - a.index);
  for (const r of sorted) {
    const line = lines[r.index];
    if (r.outcome === "pass") {
      lines[r.index] = `- [x] ${stripTag(line).slice("- [ ] ".length)} — 확인(${stamp}, 자동 — ${r.evidence})`;
    } else if (r.outcome === "fail") {
      const note = `${FAIL_NOTE_PREFIX}${stamp}): ${r.reason}`;
      let j = r.index + 1;
      let dup = false;
      while (j < lines.length && lines[j].startsWith(FAIL_NOTE_PREFIX)) {
        if (lines[j].slice(lines[j].indexOf("): ") + 3) === r.reason) dup = true;
        j++;
      }
      if (!dup) lines.splice(j, 0, note);
    }
  }
  return lines.join("\n");
}
