# FEAT-13: 결재함에서 게이트② 승인 전에 계획서 검증 통과 여부가 보이게

agent: admin-dev

## 현재 동작

- 결재함 카드는 `src/fsd/pages/pipeline/ui/index.tsx:116`의 `InboxCard`가 그린다. 메타 행(`:134-138`)은 `{item.id} · {item.status}`와, 예산 초과면 `BudgetFlag`(`:45-54`)를 렌더하고, 그 옆(`:139-145`)에 `gateTo !== null`이면 `GateTransitionButton`을 붙인다.
- `승인대기`든 `검토대기`든 승인 버튼 경로가 같다: `:118-119`가 `resolveGateTransition(item.status)`로 목적지를 구하고, 그 함수(`src/fsd/features/transition-pipeline-gate/model/transitions.ts:34-39`)는 status가 화이트리스트 `GATE_TRANSITIONS`(`transitions.ts:3-6`)에 있으면 목적지를 준다 — **검증 통과 여부와 무관**하다. 그래서 검증 전 검토대기와 검증 후 검토대기가 카드에서 구분되지 않는다.
- 보드 파서 `parseBoard`(`src/fsd/entities/pipeline/model/board.ts:24`)는 `FIELD_RE`(`board.ts:22`, `/^\s+(agent|area|status|근거|결과):\s*(.+)$/`)로 다섯 필드만 잡아 switch(`board.ts:73-94`)로 `BoardItem`(`board.ts:4-13`)에 대입한다. 정규식 alternation에 없는 필드 줄(예: `검증:`)은 매치되지 않아 조용히 무시된다.
- 검증 기록은 `docs/agents/main-loop/<항목ID>.md`에 쓰인다(보드 안내 블록 `PROJECT_BOARD.md:23`: "계획서 검증 라운드 기록은 이 보드에 쌓지 않고 docs/agents/main-loop/로 간다"). 실물 `docs/agents/main-loop/FEAT-13.md`는 게이트① 개방만 담고 클린 패스 판정은 아직 없다. 이 파일은 대시보드에 렌더 경로가 없다: `getAgentReportIndex`(`src/fsd/entities/agent-report/api/queries.ts:37`)가 `docs/agents/` 전 폴더를 `Map`으로 받아 오지만, `src/fsd/pages/pipeline/ui/_component/pixel-office.tsx:272`가 `reports.get(member.identity.id)`로 **ROSTER_ORDER 책상**(`briefing.ts:214`)만 조회한다. `main-loop`은 로스터 밖이라 그 기록은 화면에 닿지 않는다.
- 브리핑 조립: `buildBriefing`(`src/fsd/pages/pipeline/model/briefing.ts:206`)이 보드를 `inboxSpeech`(`briefing.ts:92`)로 결재함 `SpeechItem`(`briefing.ts:12-23`)을 만든다. 검토대기 분기는 `:108-119`. `SpeechItem`에는 검증 상태를 나르는 필드가 없다.
- 보드는 `src/fsd/entities/pipeline/api/queries.ts`(raw GET owner)가 한 번 읽고, 페이지(`src/app/(protected)/pipeline/page.tsx`)가 `getPipelineBoard`와 `getAgentReportIndex`를 병렬 호출한다.

## 디자인 방향

`frontend-design` 2-pass 결과다. 이 변경은 새 화면이 아니라 결재함 카드 메타 행에 붙는 작은 상태 표식이므로, 시그니처는 **도장 책상**이라는 기존 은유 안에서 절제해 만든다.

- **팔레트 (새 색 없음)**: `styles/globals.css`의 팔레트는 의도적으로 절제돼 있고(`--picked` 주석: 유채색을 함부로 늘리지 말 것) 초록이 없다. 두 상태를 기존 토큰으로 코드화한다.
  - **검증 통과** = `active`(oklch 0.5 0.09 250, 파랑) — "확인됨/부서(countersign)". 결정 대기의 amber `stamp`와도, 완료의 grey `silence`와도 구분되며 경보처럼 읽히지 않는다.
  - **검증 전** = `hold`(oklch 0.5 0.13 42, 주홍) — "도장 보류". 오류가 아니라 주의다: 신선한 계획서가 아직 검증 안 된 것은 정상이지만, 여기서 도장을 찍지 말라는 신호가 보여야 한다. 이 항목이 존재하는 이유가 그 경고다.
- **타이포 (새 역할 없음)**: 칩은 메타 행의 유틸 등급(`text-[10px] leading-4`)을 재사용해 `BudgetFlag`(`ui/index.tsx:45-54`)와 나란히 선다. 메타 행에 디스플레이 서체를 들이면 소음이다.
- **레이아웃**: 칩은 기존 status 메타 행(`ui/index.tsx:135-138`) 안, `BudgetFlag` 옆·게이트 버튼 앞에 둔다. 시선 순서가 id → status → **판정** → 도장 버튼으로 흐르게 — 판정이 그것을 게이트해야 할 행동 바로 앞에 온다. 칩이 늘어난 만큼 그 행에 `flex-wrap`을 더해 폰에서 넘치지 않고 줄바꿈되게 한다.
- **시그니처 — 부서(countersign) 칩**: 게이트 버튼이 잉크 도장(도장 임프린트)이면, 검증 표식은 리뷰어가 남기는 부서다. 통과 = **채워진 실선 칩**(`검증 통과`), 검증 전 = **점선 빈 테두리 칩**(`검증 전`) = "부서 자리가 아직 비었다". 실제 내용(리뷰가 있었나/없었나)이라는 이진값을 도장 책상의 어휘로 인코딩한다 — 일반 CI pass/fail 배지가 아니다.
- **절제(악세서리 하나 빼기)**: 체크 아이콘 SVG를 넣지 않는다. 실선/점선 테두리 + 두 글자 라벨이 상태를 이미 나른다. 아이콘은 뺀다.
- **카피 (앱 언어, 능동·평이)**: 칩 라벨은 `검증 통과` / `검증 전`(before/after 한 쌍으로 읽힌다). 통과 칩의 `title`은 보드 `검증:` 필드 원문(날짜·상세)을 그대로 보인다. 검증 전 칩의 `title`은 `아직 검증 클린 패스 기록이 없습니다 — 승인 전 확인하세요`.
- **판정 계약(문자열 파싱 없음)**: 메인 루프는 계획서 검증 **클린 패스일 때만** `검증:` 줄을 쓴다(안내 블록 규약, 「범위 밖 의존」 참조). 따라서 카드는 **필드 존재 = 통과**로 해석하고 원문을 `title`에 보인다. 필드가 없으면 `검증 전`. 되돌리기(bounce)는 이 줄을 지우므로, 재작성된 계획서는 다시 `검증 전`으로 돌아간다.
- **표시 범위**: 검증은 계획서가 있는 항목에만 의미가 있으므로 칩은 **검토대기 항목에서만** 렌더한다. 승인대기(계획 없음)에는 붙이지 않는다.

## 문제

백로그 `source`가 지목한 실패다: 결재함 카드가 검토대기 항목에 검증 전이든 후든 같은 승인 버튼을 보여준다(`ui/index.tsx:116`·`:118-119`). 원격에서 소유자는 클린 패스 여부를 알 수 없다. 검증 판정은 항목의 **상태 성격**인데 활동 기록(`docs/agents/main-loop/`)에만 남아 화면에 닿지 않으므로(`pixel-office.tsx:272`가 로스터 책상만 조회), 소유자가 게이트②(검토대기→구현승인)를 검증 전에 눌러도 카드가 말리지 않는다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/entities/pipeline/model/board.ts` | `FIELD_RE`에 `검증` 추가, `BoardItem`에 `validation: string \| null`, init·switch에 대응 |
| `src/fsd/pages/pipeline/model/briefing.ts` | `SpeechItem`에 `validation`, `inboxSpeech` 검토대기 분기가 `item.validation` 전달(승인대기·`feedSpeech`는 null) |
| `src/fsd/pages/pipeline/ui/index.tsx` | `ValidationMark` 신설, `InboxCard` 메타 행에 검토대기일 때 렌더 + 행에 `flex-wrap` |
| `src/fsd/features/transition-pipeline-gate/model/transitions.ts` | `applyBounceTransition`이 status 교체와 함께 `검증:` 줄 제거, `VALIDATION_LINE_RE` 추가 |
| `src/fsd/entities/pipeline/model/board.test.mjs` | `검증` 필드 파싱(존재→값, 부재→null) |
| `src/fsd/pages/pipeline/model/briefing.test.mjs` | 검토대기 `SpeechItem.validation` 전달, 승인대기·feed는 null |
| `src/fsd/features/transition-pipeline-gate/model/transitions.test.mjs` | bounce의 `검증:` 줄 제거(있을 때/없을 때) |

여기 없는 파일은 구현 단계에서 고치지 않는다. `PROJECT_BOARD.md` 안내 블록과 메인 루프의 필드 기록 절차는 admin-dev 쓰기 범위 밖이다 — 「범위 밖 의존」 참조.

## 구현 스케치

### 1) `board.ts` — `검증` 필드 파싱

`FIELD_RE`(`:22`) before/after:

```ts
// before
const FIELD_RE = /^\s+(agent|area|status|근거|결과):\s*(.+)$/;
// after
const FIELD_RE = /^\s+(agent|area|status|근거|결과|검증):\s*(.+)$/;
```

`BoardItem`(`:4-13`)에 필드 추가:

```ts
export type BoardItem = {
  checked: boolean;
  id: string;
  title: string;
  agent: string | null;
  area: string | null;
  status: string | null;
  reason: string | null; // 근거
  result: string | null; // 결과
  validation: string | null; // 검증 — 메인 루프가 클린 패스일 때만 쓴다
};
```

`currentItem` 초기화(`:54-63`)에 `validation: null,`을 `result: null,` 뒤에 추가. switch(`:73-93`)에 case 추가(`결과` case 뒤):

```ts
        case "검증":
          currentItem.validation = value;
          break;
```

`결과`와 달리 누적하지 않는다 — 한 항목의 검증 판정은 최신 한 줄이다(반려 시 지워지고 다음 클린 패스에 다시 쓰인다). 같은 줄이 두 번 나오면 마지막 값이 이긴다(switch 순차 대입).

### 2) `briefing.ts` — `SpeechItem`으로 전달

`SpeechItem`(`:12-23`)에 `validation: string | null;`을 `status` 아래에 추가. `inboxSpeech`(`:92-120`)의 두 분기:

- 승인대기 분기(`:95-107`)의 반환 객체에 `validation: null,` 추가(계획 없음).
- 검토대기 분기(`:108-119`)의 반환 객체에 `validation: item.validation,` 추가.

`feedSpeech`(`:162-172`)의 반환 객체에 `validation: null,` 추가(피드는 게이트 대상이 아니지만 타입 총체성 유지). `item`은 `DatedItem`(= `BoardItem` 확장, `:39`)이라 `item.validation`이 1) 이후 존재한다.

### 3) `ui/index.tsx` — 부서 칩

`BudgetFlag`(`:45-54`) 근처에 컴포넌트 신설:

```tsx
// 부서(countersign) 표식. 검증 클린 패스면 실선 active 칩, 아직이면 점선 hold 칩.
// 판정은 메인 루프가 클린 패스일 때만 `검증:` 필드를 써서 전달한다(보드 안내 규약).
// 검토대기 항목에서만 렌더한다(승인대기는 계획이 없어 판정이 없다).
function ValidationMark({ validation }: { validation: string | null }) {
  if (validation !== null) {
    return (
      <span
        title={validation}
        className="shrink-0 rounded border border-active/60 bg-active/10 px-1 text-[10px] leading-4 text-active"
      >
        검증 통과
      </span>
    );
  }
  return (
    <span
      title="아직 검증 클린 패스 기록이 없습니다 — 승인 전 확인하세요"
      className="shrink-0 rounded border border-dashed border-hold/60 px-1 text-[10px] leading-4 text-hold"
    >
      검증 전
    </span>
  );
}
```

`InboxCard` 메타 행(`:134-138`) before/after:

```tsx
// before
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {item.id} · {item.status}
          {item.overBudget && <BudgetFlag />}
        </p>
// after
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {item.id} · {item.status}
          {item.status === "검토대기" && (
            <ValidationMark validation={item.validation} />
          )}
          {item.overBudget && <BudgetFlag />}
        </p>
```

### 4) `transitions.ts` — 되돌리기가 `검증:` 줄을 지운다

`STATUS_LINE_RE`(`:50`) 아래에 정규식 추가:

```ts
// `검증:` 줄 + 그 앞 개행을 통째로 잡는다(제거 시 빈 줄이 남지 않게).
// 빈 문자열 치환이라 `$` 안전. 검증 줄이 없으면 매치 없음 → no-op.
const VALIDATION_LINE_RE = /\r?\n[ \t]+검증:[ \t]*[^\r\n]*/;
```

`applyBounceTransition`(`:157-179`) 안에서 status 교체 줄(`:170`) before/after:

```ts
// before
  const newBlock = loc.block.replace(STATUS_LINE_RE, `${loc.statusPrefix}${to}`);
// after
  // 되돌리기 = 계획 재작성. 옛 검증 판정이 남으면 재작성된 계획서에 붙어
  // 이 필드가 막으려는 오판을 이 필드가 일으킨다(FEAT-13 백로그 비고).
  const withStatus = loc.block.replace(STATUS_LINE_RE, `${loc.statusPrefix}${to}`);
  const newBlock = withStatus.replace(VALIDATION_LINE_RE, "");
```

블록의 각 필드 줄은 `\n  <필드>: ...` 형태이므로 `VALIDATION_LINE_RE`가 `검증:` 줄과 그 선행 개행을 함께 제거해 최소 diff를 유지한다. 다른 반려 경로는 손대지 않는다: `applyHoldTransition`은 검토대기→**보류**(피드로 가 칩이 렌더되지 않는 죽은 대기)라 청소가 불필요하고, `applyDiscard`는 블록을 통째 지운다. 대시보드에서 계획 재작성으로 가는 유일한 전이가 bounce다(보류→계획지시 수동 재개의 청소는 규약 몫 — 「범위 밖 의존」).

## 테스트

- **덮는 것** (`*.test.mjs`, Node 러너):
  - `board.test.mjs`: `검증:` 줄이 있는 항목은 `validation`에 값이 담기고, 없는 항목은 `null`(기존 `BOARD` 픽스처 항목으로 회귀 확인). 기존 5필드 파싱은 그대로.
  - `briefing.test.mjs`: 검토대기 항목의 `SpeechItem.validation`이 보드 `검증` 필드를 전달한다(있으면 값, 없으면 null). 승인대기 항목과 feed 항목의 `validation`은 항상 null. (기존 단언은 per-field `assert.equal`이라 `SpeechItem`에 필드가 늘어도 깨지지 않는다.)
  - `transitions.test.mjs`: `검증:` 줄이 있는 검토대기 항목을 bounce하면 status가 계획지시가 되고 `검증:` 줄이 사라진다(after 파싱 시 `validation === null`, 변경 줄 = status 1줄 + 검증 1줄 제거). 검증 줄이 없는 항목의 bounce는 status 1줄만 바뀐다(기존 `:273` 최소 diff 테스트가 이미 이 경우를 덮음 — 회귀로 명시). 화이트리스트·스테일·미발견·포맷 거부는 검증 줄 유무와 무관하게 기존대로.
- **못 덮는 범위** (도구를 새로 깔지 않는다):
  - `InboxCard`의 `ValidationMark` 실물 렌더: 실선 active 칩 vs 점선 hold 칩, `title` 툴팁, `flex-wrap` 반응형, active/hold 토큰 시각 대비, 검토대기에서만 렌더되는 조건부 — Node 러너에 DOM 없음. 배포 후 데스크톱+폰 수동 확인.
  - 메인 루프가 `검증:` 필드를 실제로 쓰는 것과 그 값 형식 — admin-dev 코드 밖(「범위 밖 의존」).
  - 보드 raw fetch·GitHub 왕복 — 기존과 동일하게 모듈 계약만 덮고 live I/O는 못 덮는다.

## 범위 밖 의존

1안의 코드 몫(파서·카드·bounce 청소·테스트)은 admin-dev 쓰기 범위 안에서 자족적이다. 그러나 **기능이 온전히 작동하려면 admin-dev 쓰기 범위 밖의 두 가지가 필요**하다. 아래는 "여기서 막힌다"가 아니라 "이 지점은 내가 못 쓴다 — 메인 루프 handoff"의 성격이며, **코드는 필드 부재에 graceful degrade하므로**(필드 없으면 `검증 전` 칩) 구현이 이 지점에 닿거나 보류되지 않는다. 규약이 채택되기 전까지는 화면이 늘 `검증 전`을 보일 뿐이다.

1. **`PROJECT_BOARD.md` 안내 블록** (admin-dev는 "내 항목 행의 status·결과"만 쓸 수 있고 안내 블록은 못 건드린다 — 정의). 문서화할 규약: (a) `검증:` 필드는 메인 루프가 계획서 검증 **클린 패스일 때만** 쓴다(카드의 "존재=통과" 계약의 근거), (b) 형식 예 `검증: 클린 패스 (YYYY-MM-DD, 무편집 N라운드)`, (c) 되돌리기(검토대기→계획지시)는 이 줄을 지운다 — 대시보드 bounce는 코드로(구현함), 수동 재개(보류→계획지시)는 이 규약으로, (d) `PROJECT_BOARD.md:23`의 "검증 라운드 기록은 이 보드에 쌓지 않고 docs/agents/main-loop/로 간다"를 **라운드 상세(파일) vs 요약 판정(필드)**로 구분하도록 한 줄 조정. 선례: FEAT-09가 "보드 안내 블록에 반려 세 전이를 기재한다(메인 루프가 구현 완료 후 처리)"로 같은 handoff를 썼다.
2. **메인 루프가 `검증:` 필드를 쓰는 절차 자체** — 파이프라인 프로세스 변경이지 admin-dev 코드가 아니다. admin-dev는 렌더 능력과 bounce 청소를 제공하고, 필드 기록은 메인 루프가 채택한다(점진적 가치 전달).

또한 `apps/admin/CLAUDE.md`는 읽기 전용이라, 테스트 인벤토리(현재 21파일·40suite·182test, `CLAUDE.md:35`)가 늘면 그 동기화도 메인 루프 handoff다(비고로 보고).

`packages/db`·다른 워크스페이스·DB 쓰기 경로 의존은 없다.

## 대안

- **1안 (채택) — 보드 `검증:` 필드**: fetch 증가 0, 기존 필드 패턴(agent/area/status/근거/결과)의 자연스러운 연장, 검증 판정은 항목의 상태 성격이라 상태 기계(보드)에 두는 것이 의미상 맞고, 렌더는 `BudgetFlag`만큼 단순하다. 미지 필드는 현 파서가 조용히 건너뛰므로(`board.ts:22` FIELD_RE 매치 실패) 규약 먼저·코드 나중 마이그레이션이 안전하다 — 메인 루프가 파서 배포 전에 `검증:` 줄을 써도 무해하게 무시된다. 비용은 메인 루프의 필드 기록(범위 밖)과 bounce 청소(범위 내, 구현함)뿐이다.
- **2안 (기각) — 새 status `검증완료`**: 검증 전 승인을 구조적으로 막지만, 게이트=사용자 전권 철학과 어긋난다(FEAT-12도 게이트 미경유 발주였다; 사용자는 언제든 게이트②를 열 수 있어야 한다). status를 하나 늘리면 전이 화이트리스트(`transitions.ts:3-6`)·feed tone map(`briefing.ts:130-135`)·목적지 재검사까지 표면이 커진다. 표식 하나를 위해 상태 기계를 바꿀 이유가 없다.
- **3안 (기각) — `docs/agents/main-loop/` 파일 목록을 결재함 행에 조인**: 존재 ≠ 클린 패스다 — 실물 `docs/agents/main-loop/FEAT-13.md`가 지금 존재하지만 게이트① 개방만 담고 클린 패스는 없다. 존재만 조인하면 거짓 "통과"가 뜬다. 판정까지 가려면 파일 내용을 가져와 파싱하는 6번째 fetch owner가 필요하고, `getAgentReportIndex`는 폴더/파일 목록만 주며 로스터 밖 `main-loop`은 `pixel-office.tsx:272` 조회에도 안 걸린다. 판정이 구조화 필드가 아니라 산문에 살아 렌더도 취약하다.
