# FEAT-26: release-verifier 루틴 — 배포 확인 원장의 화면 판정 가능 줄을 매일·배포 직후 자동 확인·마감

agent: main-loop

## 현재 동작

**원장과 마감.** `docs/release-checks.md`는 완료 항목의 「못 덮는 범위」를 모으는 상태 문서다(`docs/release-checks.md:8-20` 규칙). 마감은 세 증거뿐이고(`:13-16` — `확인(날짜, 근거)`·`대체(항목ID)`·`이관(항목ID)`), 확인 활동의 상세는 `docs/agents/main-loop/`에 쓴다(`:17-18`). 열린 줄은 2026-08-28 현재 **51줄/26절**(`grep -c '^- \[ \]'`). 닫힌 줄은 전부 사용자가 세션에서 지시했을 때 메인 루프가 스윕한 것이다(`:20` 스윕 이력 3회, 상세 `docs/agents/main-loop/FEAT-19.md:52-110`) — 배포·실사용 뒤 원장을 다시 보는 트리거가 런북에 없다. 2026-08-28 FEAT-25 배포 뒤에도 메인 루프가 curl·Playwright로 손수 3줄을 닫았다(`docs/agents/main-loop/FEAT-25.md` 「배포 확인 스윕」 두 절).

**로봇이 얻을 수 있는 세션(FEAT-25, 배포·실측 완료).** `apps/admin/src/server/auth/verifier.ts:34-42`의 Credentials provider(id `verifier`)가 `VERIFIER_SECRET` 설정 시에만 등록되고(`config.ts:24`), `guard.ts:19-30`이 verifier를 읽기 허용·`{ write: true }` 거부·1h 만료로 다룬다. 공개 계약은 `docs/plans/FEAT-25.md` 「공개 계약」: `GET /api/auth/csrf`(`__Host-authjs.csrf-token` 쿠키) → `POST /api/auth/callback/verifier`(urlencoded `csrfToken`+`secret`) → 302 + `__Secure-authjs.session-token`; 실패도 302(`/login?error=CredentialsSignin&code=credentials`, 쿠키 없음)라 **세션 쿠키 존재로 성공을 판정**한다. 2026-08-28 12:28·23:40 KST 프로덕션 실측: 로그인 302 `/` + 세션 쿠키, `/pipeline`·`/analytics`·`/observability`·`/pipeline/agents/admin-dev`·`/pipeline/docs/plans/FEAT-25` 전부 200, 본문에 「검증기 (읽기 전용)」, 무세션 `/pipeline` 307. JWT 쿠키 수명은 전역 8h(`config.edge.ts:11`)라 03:29Z 발급 세션이 14:38Z에는 `/api/auth/session` null·`/pipeline` 307이었다(정상).

**프로덕션 HTML·CSS에서 텍스트로 판정할 수 있는 것(2026-08-28 23:40 KST 실측).** verifier 세션으로 받은 `/pipeline` HTML(378,623B)에 스테퍼 캡션 낱말 "지금 "·"· 다음 "(`apps/admin/src/fsd/pages/pipeline/ui/_component/journey-stepper.tsx:69·81`), 검증 칩 "검증 통과"·"검증 전"(`apps/admin/src/fsd/pages/pipeline/ui/index.tsx:71·80`, `title={validation}` `:68`), 실행 버튼 "진행할 작업 없음"(`apps/admin/src/fsd/features/run-pipeline-command/model/run-plan.ts:42`)이 실제로 들어 있고, 게이트대기 설명 "결재함 항목에 도장을 찍으면 실행할 작업이 생깁니다."(`run-plan.ts:44`)는 보드에 `승인대기`/`검토대기`가 있을 때만 렌더된다(`run-plan.ts:12` `GATE_WAITING`·`:43-45` 분기). 대기 낱말은 다섯 개다(`apps/admin/src/fsd/pages/pipeline/model/journey.ts:41-47` — 선정 중·당신 차례·작업 중·검증 중·인수 중). HTML의 `<link rel="stylesheet" href="/_next/static/css/<hash>.css">` 하나를 받으면(37,685B) Tailwind v4가 방출한 유틸이 **이스케이프된 선택자**로 들어 있다 — `.bg-silence`·`.bg-active`·`.border-stamp`·`.border-active\/50`·`.border-stamp\/50`·`.pl-\[30\.3\%\]`·`.hover\:text-stamp`·`.motion-reduce\:transition-none`·`.sm\:block`·`.size-2\.5` 전부 1건 이상(이스케이프 없이 grep하면 0건으로 오판한다). 보드 원문은 무인증 `https://raw.githubusercontent.com/Sangeok/ApcH/dev/PROJECT_BOARD.md`가 200·64,904B로 준다.

**루틴 인프라(기존 `pipeline-command`).** 계약은 `docs/proposals/active/remote-agent-pipeline-generalization.md:105-116`(B. claude.ai 쪽 — 환경은 네트워크 정책/환경변수/setup 스크립트 셋뿐, 시크릿 금고 없음, 루틴은 관리 API로 생성 가능·`created_via: http_api`)과 `:126-166`(지침 템플릿). 2026-08-28 `RemoteTrigger get`(로컬 `/schedule` 스킬) 실측: 루틴 `trig_013BviNQtefJEXiXyPhkHCff`는 환경 `env_011CUnJuhjWSp8mBmjRv8n4o`(계정의 유일한 환경 "Default"), 모델 `claude-sonnet-5`, 도구 `Bash·Read·Write·Edit·Glob·Grep·WebFetch·WebSearch`, 소스 `https://github.com/Sangeok/ApcH`, 알림 push. API가 지원하는 동작은 `list·get·create·update·run·create_webhook_trigger·list_runs·get_run_log`이며 스케줄은 `cron_expression`(최소 1시간) 또는 `run_once_at`, GitHub 이벤트는 `create_webhook_trigger`(`POST /v1/code/webhook-triggers` — 소스·저장소·이벤트·필터·`routine_trigger_id`)로 배선한다. **환경 설정(허용 도메인·환경변수·setup 스크립트)은 이 API 밖**이다. 최근 실행 로그(`cse_01Fe8Yd9rDkGF5ikSeK8fEPW`, 2026-08-26) 실측: cwd `/home/user/ApcH`, `node_modules` 1.5G 존재, `git commit`·`git push origin dev` 성공, 디스크 28G 여유, GitHub MCP(`mcp__github__add_issue_comment`)·`PushNotification` 사용 가능, 로컬 사용자 스킬(`reconciling-proposals-with-codebase`)은 **없음**(저장소 안 `.claude/skills/`는 현재 비어 있고 디렉터리 자체가 없다 — `ls .claude` = `agents/ settings.local.json`).

**루트 스크립트·문서 지도.** 루트 `package.json:5-14`의 scripts는 `dev·dev:admin·build·check·test·db:*`뿐이고 루트 `scripts/` 디렉터리는 없다(FEAT-27도 `scripts/verify-plan` 신설을 전제). 루트 `CLAUDE.md:7-16` 문서 지도에 `.claude/skills/`·`scripts/` 행이 없다. `.gitignore`는 `.claude`·`scripts`·`.mcp.json`을 무시하지 않는다.

## 문제

백로그 FEAT-26 `source`가 지목한 것: 원장의 열린 줄이 "배포·실사용 뒤 다시 보는 트리거" 없이 쌓이고, 닫힌 줄은 전부 사람 지시 스윕이었다 — 사용자 결정 "체크리스트가 자동으로 검증됐으면". 자동이 되려면 사용자 세션 없이 깨어나는 claude.ai 루틴이어야 하고(로스터 에이전트는 메인 루프가, 메인 루프는 사용자 세션이 있어야 돈다), 그 루틴이 프로덕션 admin을 열 인증 경로가 있어야 한다(FEAT-25로 충족). 위 「현재 동작」에서 확인한 것: (1) 세션은 curl 수준으로 얻어지고, (2) 원장 줄 상당수가 **응답 상태·본문 문구·CSS 방출**만으로 판정된다(스테퍼 캡션·검증 칩·게이트대기 문구·유틸 방출 — 백로그가 "약 7건"이라 추정한 화면 판정 줄의 실체), (3) 루틴 생성·스케줄·GitHub 트리거·즉시 실행은 메인 루프가 API로 할 수 있고 환경 설정만 사용자 몫이다.

백로그와 어긋나는 점 둘을 적는다. ① 백로그 설계는 Playwright(브라우저)를 전제하지만, 클라우드 환경에서 Chromium 설치(브라우저 CDN 허용·setup 스크립트)가 되는지는 **미확인**이고, 위 (2)처럼 HTTP 층만으로 닫히는 줄이 먼저 있다. 이 계획은 **HTTP 층을 본체로** 하고 브라우저 층(hover·뷰포트·스크린샷 판정)은 「범위 밖 의존」의 후속 후보로 뺀다 — 그래서 area의 `.mcp.json`은 만들지 않는다(사유는 「대안」). ② 백로그는 "claude.ai 쪽은 사용자가 `/schedule`로"라 했지만 FEAT-24 이후 메인 루프가 `RemoteTrigger`로 루틴을 만들고 갱신할 수 있음이 실측됐다 — 루틴 생성·트리거 배선은 구현 단계에서 메인 루프가 하고, 사용자 몫은 환경 설정 둘(허용 도메인·`VERIFIER_SECRET`)로 좁힌다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `scripts/release-verify/ledger.mjs` `(신규)` | 순수 모듈(import 없음): 원장 텍스트에서 `〔auto …〕` 태그 파싱, 전제 조건·판정, 마감/불합격 되쓰기, Tailwind 선택자 이스케이프, 스타일시트 href 추출 |
| `scripts/release-verify/http.mjs` `(신규)` | Node 내장 `fetch`만 쓰는 I/O: verifier 로그인(csrf → callback → 세션 쿠키), 세션 GET, 스타일시트·보드 원문 가져오기. 비밀값·쿠키를 로그에 남기지 않음 |
| `scripts/release-verify/run.mjs` `(신규)` | 실행기 CLI: `--apply`(원장 되쓰기)·`--report <path>`(JSON)·`--base <url>`. 종료코드 0=실행 완료(개별 줄의 합·불합격은 보고서에), 2=로그인/설정 실패 |
| `scripts/release-verify/ledger.test.mjs` `(신규)` | `ledger.mjs` 단위 테스트(node:test) |
| `.claude/skills/release-verify/SKILL.md` `(신규)` | 루틴이 따르는 절차(풀·비밀값 확인·실행·원장만 커밋·푸시·보고). 프로젝트 스킬이라 클라우드 세션도 읽는다 |
| `docs/release-checks.md` | 머리말 규칙에 `자동` 마감 증거 형식과 `〔auto …〕` 태그 문법 추가; 자동 판정 가능한 열린 줄 4개에 태그 부착(FEAT-23 ×2·FEAT-22·FEAT-13) |
| `docs/proposals/active/remote-agent-pipeline-generalization.md` | 「알려진 약점」 표 뒤에 `release-verify` 루틴 계약 사본 절 추가(FEAT-24 관례 — 지침은 저장소 밖에 살아 감사가 닿지 않으므로) |
| `package.json` (루트) | `release-verify`·`test:release-verify` 스크립트 2줄 |
| `CLAUDE.md` (루트) | 문서 지도에 `.claude/skills/`·`scripts/release-verify/` 행, 런북 8단계에 자동 마감 한 문장 |

저장소 밖(구현 단계에서 메인 루프가 `RemoteTrigger`로): 루틴 `release-verify` 생성(cron `0 0 * * *` = 매일 09:00 KST) + PR 머지 webhook 트리거(best effort). `apps/admin/**`·`apps/web/**`·`apps/backend/**`·`packages/db/**`는 건드리지 않는다.

## 구현 스케치

### 태그 문법 — 원장이 곧 검사 명세다

열린 줄 끝에 한 태그를 붙인다. 괄호는 전각 `〔`(U+3014)·`〕`(U+3015)로, 본문의 어떤 문자와도 충돌하지 않는다.

```
〔auto GET <경로> [status=<n>] [text="…"]… [notext="…"]… [css="cls1,cls2"] [when="…"]… [when-any="a|b"] [when-board="<regex>"]〕
```

- `GET <경로>`: verifier 세션으로 GET. `status` 기본 200.
- `text`/`notext`: 응답 본문에 있어야/없어야 하는 문자열(따옴표 안, `"`는 쓸 수 없다). 여러 번 가능.
- `css`: 본문의 `<link rel="stylesheet">` 전부를 받아, 각 클래스가 **이스케이프된 선택자** `.cls`로 어느 하나에라도 있어야 한다.
- `when`(전부)·`when-any`(하나 이상)·`when-board`(보드 원문 정규식): **전제 조건**. 하나라도 어긋나면 그 줄은 `skip`(조건 미충족) — 판정하지 않고 원장도 건드리지 않는다. 화면이 보드 상태에 따라 달라지는 줄을 거짓 불합격에서 지킨다.

판정은 셋이다: `pass`(줄을 `[x]`로 바꾸고 `— 확인(날짜, 자동 — 근거)`를 붙이며 태그를 지운다) · `fail`(줄은 그대로, 바로 아래에 `  - 자동 불합격(날짜): 사유` 한 줄 — 같은 사유가 이미 있으면 중복 기록 없음. **백로그 이관은 사람**) · `skip`(무변경).

### 1) `scripts/release-verify/ledger.mjs` (신규 · 전체 — 순수, import 없음)

```js
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
```

### 2) `scripts/release-verify/http.mjs` (신규 · 전체)

```js
// Node 22 내장 fetch만 쓴다. 비밀값·쿠키 값은 반환 객체에만 두고 어디에도 출력하지 않는다.

function setCookies(res) {
  const out = {};
  for (const raw of res.headers.getSetCookie()) {
    const pair = raw.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq > 0) out[pair.slice(0, eq).trim()] = pair.slice(eq + 1);
  }
  return out;
}

function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

// FEAT-25 공개 계약: csrf → callback POST → 302 + 세션 쿠키. 실패도 302라 쿠키 존재로 판정한다.
export async function loginVerifier(base, secret, fetchImpl = fetch) {
  const csrfRes = await fetchImpl(`${base}/api/auth/csrf`, { redirect: "manual" });
  if (csrfRes.status !== 200) return { ok: false, step: "csrf", status: csrfRes.status };
  const jar = setCookies(csrfRes);
  const { csrfToken } = await csrfRes.json();
  const res = await fetchImpl(`${base}/api/auth/callback/verifier`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookieHeader(jar) },
    body: new URLSearchParams({ csrfToken, secret }).toString(),
  });
  Object.assign(jar, setCookies(res));
  const hasSession = Object.keys(jar).some((n) => n.endsWith("authjs.session-token"));
  if (res.status !== 302 || !hasSession) {
    return { ok: false, step: "callback", status: res.status, location: res.headers.get("location") ?? "" };
  }
  return { ok: true, cookie: cookieHeader(jar) };
}

export async function getWithSession(base, path, cookie, fetchImpl = fetch) {
  const res = await fetchImpl(`${base}${path}`, { redirect: "manual", headers: { cookie } });
  return { status: res.status, body: await res.text() };
}

export async function getText(url, fetchImpl = fetch) {
  const res = await fetchImpl(url, { redirect: "manual", headers: { "cache-control": "no-store" } });
  return res.status === 200 ? await res.text() : null;
}
```

### 3) `scripts/release-verify/run.mjs` (신규 · 전체)

```js
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
```

### 4) `.claude/skills/release-verify/SKILL.md` (신규 · 전체 — 루틴이 읽는 절차)

```md
---
name: release-verify
description: 배포 확인 원장(docs/release-checks.md)의 〔auto …〕 줄을 프로덕션 admin에서 판정해 마감한다. release-verify 루틴 전용 — 사람 세션에서는 메인 루프가 같은 스크립트를 직접 돌린다.
---

# release-verify — 원장 자동 마감 절차

고치는 파일은 `docs/release-checks.md` **하나**다. 다른 파일은 읽기만 한다. 작업은 네가 직접 한다(서브에이전트 금지).
`VERIFIER_SECRET` 값과 세션 쿠키 값은 어떤 출력·커밋 메시지·코멘트에도 적지 않는다.

1. `git checkout dev && git pull --ff-only origin dev`
2. `test -n "$VERIFIER_SECRET"` — 없으면 아무것도 하지 않고 "VERIFIER_SECRET 미설정 — 환경변수 필요"로 종료 보고한다.
3. `node scripts/release-verify/run.mjs --apply --report /tmp/release-verify.json`
   - 종료코드 2면 원장은 바뀌지 않았다. 보고서의 `login`(step·status)을 그대로 적어 종료 보고한다 — `csrf`/`callback` 실패는 대개 `VERIFIER_SECRET` 불일치·프로덕션 provider 미등록·네트워크 차단(`host_not_allowed`)이다. 백로그 이관은 사람이 한다.
4. `git diff --stat -- docs/release-checks.md`가 비어 있으면 "닫을 줄 없음"으로 종료한다(커밋 없음).
5. `git status --porcelain`이 `docs/release-checks.md` 한 줄뿐인지 확인한다. 다른 변경이 있으면 되돌리고(`git checkout -- <파일>`) 그 사실을 보고한다.
6. 커밋·푸시: `docs(ledger): 자동 확인 — pass N·fail M (release-verify)`, `git push origin dev`. 거부되면 `git pull --rebase origin dev` 후 한 번만 재시도한다.
7. 종료 보고(줄 단위): 닫은 줄 / 불합격 줄과 사유 / 조건 미충족으로 건너뛴 줄 수 / 로그인 canary(`login.ok`). 불합격은 원장 아래에 `자동 불합격(…)` 메모로 이미 남아 있다 — 사람이 확인해 `이관(항목ID)`으로 처리한다.

전제: 이 루틴의 클라우드 환경에 `VERIFIER_SECRET`(Vercel admin과 같은 값)이 있고, 허용 도메인에 `admin.a-pch.com`·`raw.githubusercontent.com`이 있다. PR 머지 직후 실행이 옛 배포를 봤더라도 해가 없다 — 불합격은 체크하지 않고, 다음 날 실행이 다시 본다.
```

### 5) `docs/release-checks.md` — 머리말 규칙과 태그 4줄

before(`docs/release-checks.md:14`):

```md
  - `확인(날짜, 근거)` — 사용자가 배포 화면에서 실물을 관측했거나, 실측 기록(Playwright 스윕 포함)이 있다.
```

after:

```md
  - `확인(날짜, 근거)` — 사용자가 배포 화면에서 실물을 관측했거나, 실측 기록(Playwright 스윕 포함)이 있다. `확인(날짜, 자동 — 근거)`는 release-verify 루틴(FEAT-26)이 프로덕션 응답으로 닫은 것이다.
```

before(`:19`):

```md
- 절은 항목별·최신순(보드 섹션 순서). 전부 닫힌 절도 지우지 않는다 — 닫혔다는 사실이 기록이다.
```

after:

```md
- 절은 항목별·최신순(보드 섹션 순서). 전부 닫힌 절도 지우지 않는다 — 닫혔다는 사실이 기록이다.
- **자동 판정 태그**: 응답 상태·본문 문구·CSS 방출만으로 판정되는 열린 줄에는 등재 시 메인 루프가 줄 끝에 `〔auto GET <경로> [status=] [text=""]… [notext=""]… [css="a,b"] [when=""]… [when-any="a|b"] [when-board="<regex>"]〕`를 붙인다(문법·판정은 `scripts/release-verify/ledger.mjs`). 루틴은 `pass`면 태그를 지우고 `[x]` + `확인(…, 자동 — …)`로 닫고, `fail`이면 줄 아래에 `  - 자동 불합격(날짜): 사유`만 남기며(이관은 사람), `when*` 전제가 안 맞으면 건드리지 않는다.
```

태그 4줄 — before/after(줄 끝에 태그만 붙는다):

```md
- [ ] 캡션 항상 표시 — "지금 <현재> · [대기 낱말] · 다음 <다음>", 호박/남색 색 일치, `flex-wrap` 폰 줄바꿈
```
```md
- [ ] 캡션 항상 표시 — "지금 <현재> · [대기 낱말] · 다음 <다음>", 호박/남색 색 일치, `flex-wrap` 폰 줄바꿈 〔auto GET /pipeline text="지금 " text="· 다음 " css="flex-wrap" when-any="선정 중|당신 차례|작업 중|검증 중|인수 중"〕
```

```md
- [ ] 신규 Tailwind 유틸 조합 방출 — `bg-silence`·`bg-active`·`border-stamp`·`border-active/50`·`border-stamp/50`가 실빌드에서 나오는지
```
```md
- [ ] 신규 Tailwind 유틸 조합 방출 — `bg-silence`·`bg-active`·`border-stamp`·`border-active/50`·`border-stamp/50`가 실빌드에서 나오는지 〔auto GET /pipeline css="bg-silence,bg-active,border-stamp,border-active/50,border-stamp/50"〕
```

```md
- [ ] 게이트대기 설명 새 문구 — "결재함 항목에 도장을 찍으면 실행할 작업이 생깁니다."(최대 5분 문장 없음)
```
```md
- [ ] 게이트대기 설명 새 문구 — "결재함 항목에 도장을 찍으면 실행할 작업이 생깁니다."(최대 5분 문장 없음) 〔auto GET /pipeline text="결재함 항목에 도장을 찍으면 실행할 작업이 생깁니다." notext="최대 5분" when="진행할 작업 없음" when-board="status: (승인대기|검토대기)"〕
```

```md
- [ ] `ValidationMark` 실선 「검증 통과」 칩·`title` 툴팁 — BUG-03 검증 클린 패스 후 보드에 `검증:` 줄이 생기면 자연 확인
```
```md
- [ ] `ValidationMark` 실선 「검증 통과」 칩·`title` 툴팁 — BUG-03 검증 클린 패스 후 보드에 `검증:` 줄이 생기면 자연 확인 〔auto GET /pipeline text="검증 통과" text="클린 패스 (" when-board="status: 검토대기[^\n]*\n(?:[^\n]*\n){0,2}\s*검증: 클린 패스"〕
```

왜 이 넷인가: 열린 51줄 중 응답·문구·CSS만으로 닫히는 줄이 이 넷이다. 나머지는 실제 도장·명령·업로드·실기기·web 로그인(자동 불가) 또는 hover·뷰포트·스크린샷(브라우저 층 — 「범위 밖 의존」)이다. FEAT-25 절의 핸드셰이크·페이지·쓰기 거부 3줄은 이미 사람이 닫았지만 같은 문법으로 표현됐을 것이며, 앞으로 등재하는 줄은 등재 시 태그를 붙인다(런북 8단계 문장, §9).

### 6) `docs/proposals/active/remote-agent-pipeline-generalization.md` — 계약 사본 절 추가

before(`:192` 절 제목 직전 — 「알려진 약점」 표의 마지막 행 다음 빈 줄):

```md
| 구독 한도 공유 | 원격 실행이 로컬 세션과 경합 | sonnet 사용, 루틴 캡 모니터링 |

## 확장 경로 — 언제 이 구조를 떠나는가
```

after(안에 코드 펜스가 있어 바깥은 4중 백틱):

````md
| 구독 한도 공유 | 원격 실행이 로컬 세션과 경합 | sonnet 사용, 루틴 캡 모니터링 |

## 두 번째 루틴 — release-verify (FEAT-26, 2026-08-28)

명령 채널이 아니라 **스케줄 구동**인 루틴. 매일 00:00 UTC(09:00 KST) + `main` 대상 PR 머지 이벤트(best effort)로 깨어나, 저장소의 `.claude/skills/release-verify/SKILL.md` 절차대로 `scripts/release-verify/run.mjs`를 돌려 `docs/release-checks.md`의 `〔auto …〕` 줄을 프로덕션 admin 응답으로 판정하고 그 파일만 `dev`에 커밋한다. 인증은 FEAT-25 verifier 세션(읽기 전용·1h)이며 환경변수 `VERIFIER_SECRET`이 Vercel admin과 같은 값으로 이 루틴의 환경에 있어야 한다. 허용 도메인 `admin.a-pch.com`·`raw.githubusercontent.com` 필요.

루틴 지침(claude.ai에 저장된 원문 — 저장소 밖이라 여기 사본을 둔다):

```
저장소 Sangeok/ApcH의 dev 브랜치에서 배포 확인 원장(docs/release-checks.md)의 자동 판정 줄을 확인해 마감한다.
절차는 저장소의 .claude/skills/release-verify/SKILL.md에 있다 — 그 파일을 먼저 읽고 그대로 따른다.
작업은 네가 직접 한다(서브에이전트 금지). 고치는 파일은 docs/release-checks.md 하나뿐이다.
VERIFIER_SECRET 환경변수 값과 세션 쿠키 값은 어떤 출력·커밋·코멘트에도 적지 않는다.
닫을 줄이 없으면 아무것도 커밋하지 않고 종료한다. 이슈 #87에는 아무것도 쓰지 않는다.
```

알려진 약점: (1) 브라우저가 없어 hover·뷰포트·스크린샷 판정 줄은 못 닫는다(후속). (2) 머지 직후 실행은 Vercel 빌드(1~2분) 전의 옛 배포를 볼 수 있다 — 불합격은 체크하지 않으므로 무해하고 다음 날 실행이 보정한다. (3) `when-board`는 raw CDN(`max-age=300`)을 읽어 최대 5분 낡을 수 있다 — 전제 조건이 늦게 맞아 `skip`이 될 뿐 거짓 `pass`는 없다.

## 확장 경로 — 언제 이 구조를 떠나는가
````

### 7) 루트 `package.json`

before(`package.json:12-13`):

```json
    "db:migrate": "npm run db:migrate -w @repo/db",
    "db:studio": "npm run db:studio -w @repo/db"
```

after:

```json
    "db:migrate": "npm run db:migrate -w @repo/db",
    "db:studio": "npm run db:studio -w @repo/db",
    "release-verify": "node --env-file=.env scripts/release-verify/run.mjs",
    "test:release-verify": "node --test \"scripts/release-verify/*.test.mjs\""
```

`node --env-file`은 Node 20.6+(로컬 22.13 실측). 루틴은 환경변수가 이미 있으므로 `node scripts/release-verify/run.mjs`를 직접 부른다(SKILL.md 3단계). 테스트 인자는 **glob**이어야 한다 — `node --test scripts/release-verify/`(디렉터리)는 로컬 Node 22.13에서 `Cannot find module …/scripts/release-verify`로 실패했다(검증 조립 실측). Node가 glob을 스스로 펼치므로(v21+) 따옴표로 셸 확장을 막는다.

### 8) 루트 `CLAUDE.md` — 문서 지도 두 행 + 런북 8단계 한 문장

before(`CLAUDE.md:15-16`):

```md
| `.claude/agents/*.md` | 에이전트 정의 (역할·도구·제약) |
| `apps/*/CLAUDE.md` | 워크스페이스별 지시 문서 |
```

after:

```md
| `.claude/agents/*.md` | 에이전트 정의 (역할·도구·제약) |
| `.claude/skills/release-verify/` | release-verify 루틴이 따르는 원장 자동 마감 절차(FEAT-26). 스크립트는 `scripts/release-verify/` |
| `apps/*/CLAUDE.md` | 워크스페이스별 지시 문서 |
```

before(런북 8단계 — `CLAUDE.md`의 "8. 메인 루프가 인수한 항목의 「못 덮는 범위(배포 후 수동 확인)」를 `docs/release-checks.md`에 등재한다." 문장 시작 줄):

```md
8. 메인 루프가 인수한 항목의 「못 덮는 범위(배포 후 수동 확인)」를 `docs/release-checks.md`에 등재한다. 마감은 그 파일의 규칙대로 증거로만 한다 — 사용자의 실물 관측(확인) · 후속 항목의 화면 교체(대체) · 결함의 백로그 이관(이관). 결함이 나오면 `TASK_BACKLOG.md`에 항목을 만든다
```

after:

```md
8. 메인 루프가 인수한 항목의 「못 덮는 범위(배포 후 수동 확인)」를 `docs/release-checks.md`에 등재한다. 응답 상태·본문 문구·CSS 방출만으로 판정되는 줄에는 `〔auto …〕` 태그를 붙여 release-verify 루틴이 닫게 한다(문법은 원장 머리말). 마감은 그 파일의 규칙대로 증거로만 한다 — 사용자의 실물 관측(확인) · 루틴의 프로덕션 응답(자동) · 후속 항목의 화면 교체(대체) · 결함의 백로그 이관(이관). 결함이 나오면 `TASK_BACKLOG.md`에 항목을 만든다
```

### 9) 저장소 밖 — 루틴 생성(구현 단계, 메인 루프가 `RemoteTrigger`로)

`action: create` 본문(환경·모델·소스는 기존 루틴 실측값 그대로):

```json
{
  "name": "release-verify",
  "cron_expression": "0 0 * * *",
  "enabled": true,
  "job_config": {
    "ccr": {
      "environment_id": "env_011CUnJuhjWSp8mBmjRv8n4o",
      "session_context": {
        "model": "claude-sonnet-5",
        "sources": [{ "git_repository": { "url": "https://github.com/Sangeok/ApcH" } }],
        "allowed_tools": ["Bash", "Read", "Edit", "Glob", "Grep"]
      },
      "events": [{ "data": { "uuid": "<새 v4 uuid>", "session_id": "", "type": "user", "parent_tool_use_id": null,
        "message": { "role": "user", "content": "<§6의 루틴 지침 원문>" } } }]
    }
  }
}
```

도구에 `Write`·`WebFetch`·`WebSearch`·MCP 연결을 주지 않는다(원장 한 파일 편집·스크립트 실행뿐). 생성 직후 `action: run`으로 1회 즉시 실행해 첫 실측을 받고, 그 실행 로그(`list_runs`→`get_run_log`)로 네트워크·환경변수 전제를 확인한다. PR 머지 트리거는 `create_webhook_trigger`(소스 GitHub·저장소 `Sangeok/ApcH`·이벤트 `pull_request`·필터 closed+merged+base `main`·`routine_trigger_id`)를 시도하되 **형태는 서버 검증 응답으로 맞추고, 실패하면 cron만으로 간다**(best effort — 백로그 설계의 "배포 직후"는 다음 날 실행이 대신한다).

## 테스트

- **덮는 것** — `scripts/release-verify/ledger.test.mjs`(node:test, `npm run test:release-verify`)
  - `cssEscape`: `border-active/50`→`border-active\/50`, `pl-[30.3%]`→`pl-\[30\.3\%\]`, `hover:text-stamp`→`hover\:text-stamp`, `size-2.5`→`size-2\.5`, 평문 `bg-active` 불변.
  - `hasSelector`: 이스케이프 선택자 존재 시 true, 접두 충돌(`.hidden` vs `.hidden-x`) false, 미방출 false.
  - `parseTag`: 전 키 파싱(status 숫자·text/notext 복수·css 콤마 분리·when 복수·when-any `|` 분리·when-board 정규식 원문 보존), 따옴표 안 공백·`|` 보존, 미지 키 throw, GET 외 method throw, 경로 누락 throw, 기본 status 200.
  - `parseLedger`: 열린 줄의 태그만 수집(`[x]` 줄·태그 없는 줄 제외), 절 제목 귀속, 미닫힘 태그 throw, CRLF 입력 무관(실행기가 LF로 정규화).
  - `stylesheetHrefs`: `rel="stylesheet"`만·순서·중복 제거·`preload` 제외.
  - `preconditionsMet`/`evaluateCheck`: when 미충족→skip, when-any 하나 충족→진행, when-board 보드 없음→skip·정규식 불일치→skip·일치→진행; status 불일치·text 누락·notext 존재·css 미방출 각각 fail 사유 문자열; 전부 충족→pass와 근거 문자열 형식(`GET /pipeline 200 · text 2/2 · css 5/5`).
  - `applyResults`: pass가 `- [x]`·태그 제거·`— 확인(stamp, 자동 — 근거)` 부착, fail이 바로 아래 `  - 자동 불합격(stamp): 사유` 삽입, 같은 사유 재실행 시 중복 없음(멱등), 다른 사유는 추가, skip 무변경, 다른 줄 바이트 불변. **인덱스 안정은 "fail이 줄을 삽입한 직후 줄에 pass"로 잠근다** — 결과 `{6: fail}`·`{7: pass}`를 함께 적용하면 7번 줄(원래 텍스트)이 닫히고 그 위에 불합격 메모가 있어야 한다. 위→아래로 적용하면 메모가 7번을 밀어 메모 줄에 `[x]`가 붙는다(검증 조립의 돌연변이 M14가 이 케이스 없이는 살아남았다).
  - `kstStamp`: UTC 2026-08-28T15:00Z → `2026-08-29 00:00 KST`(날짜 넘김).
- **실측 조립(검증 라운드, 2026-08-28 23:51 KST)**: 위 4태그를 붙인 원장 **사본**으로 `node --env-file=.env scripts/release-verify/run.mjs --ledger <사본> --apply --report <scratch>`를 프로덕션에 실행 — 로그인 ok, **pass 3·skip 1**: 유틸 방출 pass(css 5/5), 캡션 pass(text 2/2·css 1/1), 게이트대기 문구 pass(text 1/1·notext 1/1 — 그 시각 보드에 FEAT-26 `검토대기`가 있어 `hasGateWaiting`이 참), 검증 칩 skip(`when-board` 미충족 — 검토대기 항목에 `검증:` 줄이 아직 없음). 사본은 pass 3줄만 `[x]`+`확인(…, 자동 — …)`로 바뀌고 태그가 지워졌으며 나머지 줄은 바이트 불변. 판정은 **보드 상태에 따라 달라진다** — 같은 태그가 FEAT-26이 `계획지시`였던 23:40에는 게이트대기 문구가 HTML에 없었다(`run-plan.ts:43-45` 분기 그대로).
- **전제 조건이 하는 일(음성 시험)**: FEAT-13 태그에서 `when-board`만 지우고 돌리면 skip이 **fail**(`text 없음: "클린 패스 ("`)로 바뀐다 — 페이지에 "검증 통과" 낱말은 다른 카드에 있어도 `title="클린 패스 (…"`는 검토대기+검증 카드에만 있으므로, 전제 없이는 거짓 불합격 메모가 원장에 남는다. `VERIFIER_SECRET` 부재 → 종료코드 2(`login.step = "env"`), 오답 → 종료코드 2(`step = "callback"`, status 302), 미지 키 → 파싱 실패로 종료코드 2·원장 무변경.
- **못 덮는 범위** (배포 후 수동 → 원장에 등재)
  - 클라우드 환경에서의 실제 실행: 네트워크 허용(`admin.a-pch.com`·raw)·`VERIFIER_SECRET` 존재·Node 버전·`git push` — 첫 `action: run`의 로그로만 확인.
  - `create_webhook_trigger` 본문 형태와 PR 머지 발화 — 서버 응답으로 확인.
  - 원장 되쓰기의 실제 커밋 왕복(루틴이 `dev`에 푸시, 메인 루프 편집과의 충돌 재시도).
  - 스크립트가 fail을 낸 줄의 사람 판정(이관 여부).

## 범위 밖 의존

**구현을 막는 범위 밖 의존은 없다** — 저장소 안 산출물은 전부 main-loop 쓰기 범위(루트 문서·`scripts/`·`.claude/`·`docs/`)다. 다음은 구현을 막지 않는 외부 선행/후속이다(코드는 완성되고 루틴은 값이 들어올 때까지 종료코드 2로 무해하게 끝난다):

- **클라우드 환경 설정(사용자, claude.ai 웹 UI)**: 환경 `Default`에 환경변수 `VERIFIER_SECRET`(Vercel admin과 같은 값) + 허용 도메인 `admin.a-pch.com`·`raw.githubusercontent.com`. 관리 API 밖이라 메인 루프가 대신할 수 없다. 이 환경은 `pipeline-command` 루틴과 공유된다 — 그 루틴도 이 비밀값을 읽게 되지만(시크릿 금고 없음) 읽기 전용 verifier 세션 이상은 못 한다(FEAT-25 설계).
- **브라우저 층(후속 후보)**: hover 들림(FEAT-08·15·17), 폰 뷰포트 px(BUG-07), 노드 색/라벨 반응형(FEAT-23) 같은 줄은 Playwright가 필요하다. 클라우드 환경의 Chromium 설치 가능성(브라우저 CDN 허용·setup 스크립트)이 확인되면 `〔auto-browser …〕` 태그와 `--browser` 실행 경로를 더한다 — 이 항목에서는 하지 않는다.
- **PR 머지 트리거**: `create_webhook_trigger`의 본문 형태가 미확인. 실패해도 cron이 본체다.

## 대안

- **Playwright MCP(`.mcp.json`) + LLM 판정 vs 결정적 스크립트** → 스크립트. 루틴이 화면을 "보고 판단"하면 증거가 산문이 되고 같은 입력에 다른 결론이 날 수 있다. 원장 줄에 태그를 심어 스크립트가 판정하면 (a) 동일 입력→동일 결과, (b) 근거가 기계 출력, (c) 로컬에서 같은 명령으로 재현·단위 테스트 가능(FEAT-27의 원칙과 같다). 브라우저가 필요한 줄은 이 구조에 `auto-browser` 태그로 나중에 얹는다. 그래서 area의 `.mcp.json`은 만들지 않는다.
- **검사 카탈로그를 별도 파일(예 `scripts/release-verify/checks.json`)로 두기 vs 원장 줄에 태그** → 태그. 카탈로그는 원장과 두 벌이 되어 줄이 닫히거나 문구가 바뀔 때 어긋난다. 태그는 줄과 함께 살고 함께 지워진다. 전각 괄호는 본문·코드·URL 어디에도 안 쓰이는 문자다.
- **루틴이 원장을 직접 편집(LLM) vs 스크립트 `--apply`** → 스크립트가 쓴다. 루틴의 몫은 풀·실행·커밋·보고뿐이라 지침이 짧고 실패 모드가 적다.
- **스케줄: 매시간 vs 매일 + PR 머지** → 매일 + 머지(best effort). 원장 줄은 배포 뒤 한 번 닫히면 끝이라 잦은 실행은 구독 사용량만 쓴다.
- **1h 만료 줄(FEAT-25)까지 자동화** → 안 한다. 발급 후 1시간 대기가 필요해 실행 시간 예산을 넘고, 가치 대비 비용이 높다. 사람이 한 번 닫으면 끝나는 줄이다.
