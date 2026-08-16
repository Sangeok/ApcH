# FEAT-09: `/pipeline` 결재함에 반려 경로 — 게이트 거절을 대시보드에서

agent: admin-dev

> template.md의 절 구조를 따르되, **admin-dev 역할 규칙(UI 작업이면 디자인 방향을 절로 남긴다)**에 따라
> 「현재 동작」과 「문제」 사이에 `## 디자인 방향` 절을 둔다(FEAT-06/07/08 계획과 동일 구조).
> FEAT-08이 승인(도장)만 만들었고, 이 항목은 그 옆에 **거절 세 갈래**를 낸다 —
> 되돌리기(재작성)·보류(대기)·폐기(제거). 도장 은유를 그대로 두고 거절의 형태만 새로 정의한다.

## 현재 동작

`/pipeline` 결재함은 게이트 항목(승인대기·검토대기)을 카드로 보여주고, FEAT-08이 얹은 **도장 버튼으로 전진 전이만** 커밋할 수 있다. **거절(반려) 수단은 없다.**

- 결재함 카드 `InboxCard`(`ui/pipeline-page.tsx:90-130`): 상단 아바타·발화(`:105` `text-lg text-stamp`), 메타 행(`:106-117`)에 왼쪽 `{item.id} · {item.status}`(`:107-109`)와 오른쪽 도장 버튼(`:110-116`, `gateTo !== null`일 때만), 근거 `<details>`(`:118-127`, summary `근거 보기` `:120` `text-xs text-muted-foreground`). 라벨은 `gateTo = item.status === null ? null : resolveGateTransition(item.status)`(`:92-93`)로 도출한다.
- 전이 화이트리스트 `pipeline/transitions.ts`: `GATE_TRANSITIONS = { 승인대기: "계획지시", 검토대기: "구현승인" }`(`:3-6`)가 유일한 전진 전이다. `resolveGateTransition`(`:11-16`)은 `Object.hasOwn` 멤버십으로 프로토타입 오염 키까지 막는 보안 경계다. `applyGateTransition`(`:31-69`)이 **화이트리스트 → 항목 최신 행 탐색 → 형식 → 스테일(값 대조) → status 줄만 교체**를 순수하게 수행한다. 상수: `escapeRegExp`(`:22-24`), `STATUS_LINE_RE = /^([ \t]+status:[ \t]*)(.+?)[ \t]*$/m`(`:27`), `BLOCK_END_RE = /\n(?=- \[|#|>)/`(`:29`). `gateCommitMessage`(`:76-78`)는 `COMMIT_PHRASE`(`:72-75`)로 `docs(board): … via dashboard gate` 커밋 메시지를 만든다.
- 서버 액션 `pipeline/commit-transition.ts:22-85` `commitGateTransition(id, expectedStatus)`: `requireAdmin()`(`:27`, try 밖 최상단) → 토큰 확인(`:29-33`) → contents API GET(`:36-45`, `?ref=dev`, `no-store`) → base64 디코드(`:53`) → `applyGateTransition`(`:56`) → PUT(`:62-77`, `sha` 낙관적 잠금) → 409 분기(`:78-80`). 순수 거부 사유를 사용자 문구로 옮기는 `REASON_MESSAGE`(`:15-20`, not-whitelisted/not-found/format/stale).
- 클라 버튼 `ui/pipeline-gate.tsx` `GateTransitionButton`(전체): `"use client"` + `useTransition` + `commitGateTransition` 호출 + `toast` + `router.refresh()`. 도장 임프린트 스타일 `STAMP_BUTTON_CLASS`(`:13-17`, `bg-stamp-soft`·`border-2 border-stamp`·`shadow-[1px_1px_0_0_var(--stamp)]`·`hover:-translate-y-px active:shadow-none`·라벨 잉크 `text-[oklch(0.50_0.12_62)]`). **순수 모듈을 임포트하지 않는다**(서버가 `label`을 넘긴다).
- 브리핑 `pipeline/briefing.ts`: `GATE_STATUSES = new Set(["승인대기", "검토대기"])`(`:30`) — 이 둘만 결재함, 나머지는 피드. `FEED_TONE`(`:112-117`)에 `계획지시`·`구현승인`=`active`, `완료`=`done`, `보류`=`hold`가 이미 있고, `feedSpeech`(`:119-154`)가 `보류`를 `summarize(item)`(=`결과` 첫 문장)로, `계획지시`를 `"… 계획을 작성하고 있습니다."`로 렌더한다. **거절 후 세 목표(계획지시·보류)는 이미 피드에서 올바르게 렌더된다** — 브리핑 변경 불필요.
- 보드 파서 `pipeline/board.ts`: 항목 필드 `FIELD_RE = /^\s+(agent|area|status|근거|결과):\s*(.+)$/`(`:22`)가 `결과` 줄을 이미 인식한다(`:86-88`). 빈 섹션(항목 0개)은 버린다(`:94`).
- 보드 커밋 좌표는 FEAT-08이 이미 깔았다: `pipeline/github.ts:12-13` `BOARD_PATH`·`BOARD_CONTENTS_URL`, `:4` `BOARD_BRANCH`. **github.ts 변경 불필요.**
- 토큰 스키마·주석은 FEAT-08이 Contents RW를 이미 명기했다(보드 result 기록, `env.js` 「토큰 주석만·스키마 불변」). **env.js 변경 불필요** — 거절 세 경로도 전부 같은 보드 콘텐츠 커밋이라 권한 요건이 동일하다.
- 보류 사유 기록의 선례: `PROJECT_BOARD.md:75-80` FEAT-01. `status: 보류`(`:78`) 아래 `근거:` 다음에 `결과: 사용자 결정(2026-08-16) — 지금은 착수하지 않는다. …`(`:80`)가 붙어 **사유를 보드에 남긴다**. 필드 순서는 agent·area·status·근거·결과.
- 인가 3중 방어선(`auth/config.ts` signIn · `config.edge.ts` authorized · `guard.ts:7-27` `requireAdmin()`)이 "로그인 세션 = 소유자"를 보장한다(CLAUDE.md:72-84). 새 경로도 `requireAdmin()` 뒤다.
- 타입: `noUncheckedIndexedAccess: true`(CLAUDE.md:52) — 인덱스·캡처 그룹 접근은 `… | undefined`라 전부 가드해야 한다(FEAT-03 파서 교훈).

## 디자인 방향

_(게이트② 판단 근거. 새 화면이 아니라 기존 stamp 결재함 카드에 거절 어포던스를 더하는 것이므로, 방향은 "승인 도장과 시각적으로 구분되는 반려의 형태"에 집중한다.)_

**대상 세계.** 이 화면의 은유는 결재 서류다 — FEAT-04~08이 확정했다. 사무실 배너가 `당신의 책상 — 결재 N건이 도장을 기다립니다`(pixel-office.tsx `OwnerBanner:272`)라고 말하고, 승인은 양피지(`--stamp-soft`) 위에 오커 잉크(`--stamp`)를 **내리찍는 도장**이다. 결재는 승인과 반려가 쌍이다 — 관공서 서류에서 도장이 승인이라면, 반려는 **여백에 펜으로 남기는 처리 지시**(돌려보냄·보류·폐기)다. FEAT-09는 새 은유를 들이지 않고, 이 세계에 이미 있는 두 번째 필기구인 "여백의 펜 메모"로 거절을 표현한다.

**시그니처 요소 — 눌러 찍는 도장 vs 돌려보내는 여백 메모.** 이 카드가 기억될 한 가지는 **승인과 거절의 형태 대비**다.
- 승인(도장): 양피지에서 **솟았다가 눌러 찍히는** 세리프 오커 임프린트(FEAT-08, 변경 없음). 권위·확정·한 번의 동작.
- 거절(여백 메모): **평평한 산세리프 펜 글씨.** 테두리도 그림자도 들림도 없다 — 도장이 아니다. 카드에 이미 있는 `근거 보기` 여백 메모(`pipeline-page.tsx:120`, `text-xs text-muted-foreground`)와 같은 목소리로 `반려`를 접어 두고, 펼치면 처리 지시들이 여백 세로줄(`border-l`) 안에 늘어선다.
- **타이포 분업이 곧 구분이다**: 도장=세리프(`font-briefing-display`, 官印 권위) / 반려=산세리프 본문(서기의 여백 필기). 색이 아니라 **형태와 서체**로 승인/거절을 가른다.

**팔레트 (신규 토큰 없음).** 전부 기존 토큰을 재사용한다. 거절 처리 지시의 **라벨 글자는 `--foreground`**(근검정, 대비 안전)로 두고, **뜻은 낱말 + 작은 색 마커(비텍스트)**로 나른다 — 어휘·색 일관성을 브리핑 피드와 맞춘다:
- 되돌리기 마커 `--active`(`globals.css:87`, 파랑) — 되돌리면 `계획지시`(피드 `active` tone, `briefing.ts:113`)로 가 "작성 중"이 된다. 같은 색이 버튼→피드로 이어진다.
- 보류 마커 `--hold`(`:89`, 번트 시에나) — 피드의 `보류` tone 색(`briefing.ts:116`)과 동일. 버튼 보류 → 보드 status 보류 → 피드 hold 색이 한 낱말·한 색으로 이어진다.
- 폐기 마커 `--destructive`(`:76`, 팔레트 유일한 위험색 빨강) — 되돌릴 수 없는 유일한 액션에만 쓴다. 장식 아님.
- 반려 접힘 트리거는 `--muted-foreground`(카드의 `근거 보기`와 같은 회색 여백 메모).

**레이아웃 개념 — 무게의 계단.** 승인보다 거절이 무겁다(백로그 요구 3)를 **동작 수의 계단**으로 표현한다:
- 승인 도장: 1클릭(그대로).
- 되돌리기·보류: `반려` 펼침(1) + 선택(1) = **2동작**.
- 폐기: 펼침(1) + 폐기(1) + 확인(1) = **3동작**(되돌릴 수 없으므로 인라인 확인 한 단계 추가).

메타 행은 그대로 두고(왼쪽 `{id}·{status}`, 오른쪽 도장), 그 **아래에** `반려` 트리거를 둔다. 펼치면 여백 세로줄 패널이 처리 지시들을 세로로 편다.

```
결재함 카드(변경 후)
┌───────────────────────────────────────┐
│ 🧑 PM · 선정·발주                        │
│ FEAT-09, 1일째 계획 지시를 기다립니다.     │
│ FEAT-09 · 승인대기            [ 계획지시 ]│  ← 도장(솟음/눌림, 세리프 오커)
│ 반려 ▾                                  │  ← 여백 메모(평평, 회색 산세리프)
│ ▸ 근거 보기                             │
└───────────────────────────────────────┘

반려 펼침 후(승인대기 예: 되돌리기 없음)     반려 펼침 후(검토대기 예)
│ 반려 닫기                                │ 반려 닫기
│ ▏ ■ 지금은 보류        (hold 마커)       │ ▏ ■ 계획 다시 쓰기   (active 마커)
│ ▏ ■ 폐기               (destructive)     │ ▏ ■ 지금은 보류      (hold 마커)
│                                          │ ▏ ■ 폐기            (destructive)
폐기 클릭 시 그 줄이 확인으로 바뀐다:
│ ▏ 되돌릴 수 없습니다. 폐기할까요?  [취소] [폐기 확인]
```

**접근성·대비.**
- 처리 지시 **라벨 글자는 `--foreground`**(근검정) — 측정 불필요한 높은 대비.
- **마커는 비텍스트(3:1 기준)**: `--hold`(L≈0.5)·`--active`(L≈0.5)·`--destructive`(L≈0.577)는 전부 양피지(L 0.94) 위에서 ≥3.7:1(FEAT-08이 `--stamp` 3.71:1 실측). 색 단독 전달 아님(낱말이 뜻을 진다).
- **폐기 확인 상태의 위험 강조 텍스트**만 `--destructive`가 아니라 어두운 빨강 `oklch(0.50 0.20 27)`(신규 토큰 없는 arbitrary value)를 쓴다 — 12px AA 4.5:1을 위해. FEAT-08이 오커 라벨을 `oklch(0.50 0.12 62)`(5.20:1)로 내린 방식 그대로다. L=0.50 빨강은 같은 L 오커보다 상대휘도가 낮아 대비가 더 높다(≥5.2:1 예상). **B단계에서 실측 확인**(FEAT-08 선례).
- 실제 HTML `<button>`(키보드 포커스·`focus-visible` 링은 shadcn `Button`/네이티브 버튼 기본). pending 라벨(`처리 중...`/`폐기 중...`)로 상태를 텍스트로 전한다. 실패는 토스트로 사유를 말한다(조용한 실패 금지).
- 모션: 도장의 `hover:-translate-y-px`/`active` 외에 상시 애니메이션 없음. 반려 패널은 즉시 펼침(transform-only 아님, `prefers-reduced-motion` 무관).

**말(카피) — 동작이 흐름 내내 같은 이름을 유지한다(frontend-design).**
- `계획 다시 쓰기`(되돌리기) → 토스트 `계획지시로 되돌렸습니다`. 보드 status `계획지시`.
- `지금은 보류` → 토스트 `보류했습니다`. 보드 status `보류`.
- `폐기` → 확인 `되돌릴 수 없습니다. 폐기할까요?` → 토스트 `${id}를 폐기했습니다. TASK_BACKLOG.md 항목은 직접 정리하세요.`(백로그를 코드가 건드리지 않으므로 안내로 마무리 — 백로그 out-of-scope 준수).
- 실패 문구는 `REASON_MESSAGE` 재사용(스테일 `보드가 이미 바뀌었습니다. 새로고침 후 다시 시도하세요` 등).

**의도적 이탈(게이트② 확인 대상).**
1. **보류 사유는 UI 입력이 아니라 고정 날짜 문구.** `결과:` 줄에 `사용자 결정(YYYY-MM-DD) — 대시보드에서 보류. 폐기가 아니라 대기이며 TASK_BACKLOG.md에 남는다. 재개하려면 이 행을 계획지시 또는 구현승인으로 되돌린다.`를 넣는다(FEAT-01 실제 보류 기록 `PROJECT_BOARD.md:80`의 형태 그대로). 자유 입력을 택하지 않은 이유는 「대안」에. 게이트②에서 뒤집을 수 있다.
2. **폐기는 보드 행만 제거하고 백로그는 손대지 않는다**(토스트로 안내). 백로그도 함께 커밋하는 안은 「대안」에 두고 게이트②에서 켤 수 있다.
3. **폐기 마커에만 빨강을 쓴다** — 승인/거절을 색이 아니라 형태(도장 vs 펜)로 가르되, 되돌릴 수 없는 폐기만 위험색으로 격을 올린다.
4. **`계획지시`·`구현승인` 항목에는 반려 어포던스가 없다.** 결재함은 `GATE_STATUSES`(승인대기·검토대기)만 담고(`briefing.ts:30`) 백로그가 정의한 반려 from-상태에도 그 둘이 없어 **계약대로**다. 다만 FEAT-08이 결정과 실행을 분리했으므로 게이트를 연 뒤 실행 전까지 항목이 피드에 머물 수 있고, 그 사이 마음이 바뀌면 다시 대시보드 밖에서 고쳐야 한다 — 확장 필요 여부는 게이트②에서 판단(후속 항목 후보).
5. **다중 등장 항목을 폐기하면 이력 행이 남는다.** `applyDiscard`는 최신(위) 행만 지우므로, 같은 ID가 이력 섹션에도 있으면 그 행이 남아 브리핑에서 **완료로 재등장**한다(`flatten`의 첫 등장 우선, `briefing.ts:33-47`). FEAT-08 게이트 전이와 같은 보드 모델 성질이라 새 결함은 아니고 수동 정리로 족하다 — 폐기 토스트가 백로그 정리를 안내하듯, 이력 행도 사용자 몫이다.
6. **보드 안내 블록(`PROJECT_BOARD.md:7-17`)은 이 항목이 고치지 않는다.** 루트 `CLAUDE.md`가 "상태·전이의 진실은 안내 블록"이라 하는데, 반려 세 전이(역전이·대시보드발 보류·행 제거)는 거기 서술돼 있지 않다. admin-dev는 안내 블록을 편집할 수 없으므로(`admin-dev.md`) **B단계 「비고」로 갱신 대상에 포함해 보고**한다(CLAUDE.md 갱신과 같은 방식) — 안내 블록에 반려 전이를 적을지, "반려는 소유자 수동 관리의 UI 노출일 뿐 상태 기계 변경이 아니다"로 둘지는 게이트②/메인 루프 판단이다.

## 문제

백로그 `source`(요구 원천, `TASK_BACKLOG.md:66-79`)가 지목한 것: **FEAT-08이 결재함에 승인(도장)만 넣고 거절 수단을 남기지 않았다.** 결재는 승인·반려가 쌍인데 승인만 만들었다 — 계획서가 마음에 안 들거나 항목을 접으려면 대시보드 밖(Claude 세션 지시 또는 보드 파일 직접 수정)에서만 가능하다. 실제로 FEAT-01을 내리는 데 이 경로가 필요했고 수동 처리했다(`PROJECT_BOARD.md:80`). 코드에서 확인: `InboxCard`(`pipeline-page.tsx:106-117`)에는 도장 버튼(`:110-116`)만 있고 거절 버튼이 없으며, `transitions.ts`의 화이트리스트(`:3-6`)에는 전진 전이 두 개뿐이라 되돌리기·보류·폐기가 커밋될 구조 자체가 없다.

**거절은 세 갈래이고 성격이 다르다**(백로그 「거절은 한 가지가 아니다」). 각각을 코드 동작으로 확정한다:

- **(a) 되돌리기** — "계획이 틀렸다, 다시 써". `검토대기` → `계획지시`. status 줄만 교체(`applyGateTransition`과 같은 기계). 되돌린 뒤 그 항목은 결재함을 떠나 피드에서 `계획을 작성하고 있습니다`(`briefing.ts:126`)로 보인다. **재작성 처리**: 되돌리면 담당 dev가 다음 실행에서 `계획지시`를 만나 계획서를 쓴다 — admin-dev의 기존 A-3 규칙("같은 이름의 파일이 이미 있으면 읽지 말고 덮어쓴다")이 "기존 계획서를 새로 덮어쓴다"를 이미 실현한다. **계획서 파일은 그 자리에 남고 다음 계획 라운드에서 통째로 덮어써진다** — FEAT-09가 dev 쪽에 새로 넣을 동작은 없다.
- **(b) 보류** — "지금은 안 한다". `승인대기`·`검토대기` → `보류`. status 줄 교체 **+ `결과:` 줄 기록**(있으면 교체, 없으면 근거 줄 뒤 삽입 — 사유를 보드에 남긴다, 백로그 요구 2). **교체가 일반 경로다**: 담당 dev가 계획서를 쓰면 `결과:` 줄을 남기므로(실측: `PROJECT_BOARD.md`의 검토대기 FEAT-09 행이 이미 `결과:`를 갖는다) 검토대기 항목 보류는 대개 삽입이 아니라 교체로 간다. 폐기가 아니라 대기라 백로그에는 남는다. 재개는 보드 안내 블록 규칙(`PROJECT_BOARD.md:16`, `계획지시` 또는 `구현승인`으로 되돌림).
- **(c) 폐기** — "이 항목 자체가 필요없다". **보드 행 제거**(전이 아님). 되돌릴 수 없는 유일한 것이라 안전 등급이 다르다 — 인라인 확인 한 단계를 붙인다. 백로그 항목 제거는 out-of-scope(백로그 편집 UI는 별개 항목)라 **보드 행만 제거하고 사용자에게 백로그 정리를 안내**한다(백로그 「out of scope … 백로그는 손대지 않고 보드 행만 제거 + 사용자에게 안내」 예시 채택).

**불변식(백로그 요구 1·4, FEAT-08 그대로).** 새 전이도 같은 순수 모듈(`transitions.ts`)에 **허용 쌍**으로 선언한다 — "임의 status·임의 (action, from) 쌍은 커밋 불가"를 유지한다. 스테일 가드(화면 값 대조 + sha 낙관적 잠금)도 동일 적용. 이슈 #87 채널의 게이트 거절(`GATE_GUARD`)은 그대로 둔다 — 새 경로도 이슈 경유가 아니라 contents API로 보드를 커밋하는 인증된 대시보드 전용이다. 클라이언트는 **key(action)만** 보내고 본문·목표는 서버가 화이트리스트로 정한다.

**성격.** 새 외부 쓰기 **경로(target)는 늘지 않는다** — FEAT-08이 연 보드 콘텐츠 커밋(contents API, `PROJECT_BOARD.md`) 하나를 그대로 쓴다. 다만 편집 **종류**가 늘어난다: status 줄 교체(되돌리기)·줄 삽입(보류)·행 제거(폐기). DB는 건드리지 않는다(읽기 전용 유지). 백로그 파일은 코드가 쓰지 않는다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/pipeline/transitions.ts` `(수정, 순수)` | 반려 화이트리스트 `REJECT_TRANSITIONS`(bounce/hold/discard의 허용 from·목표 to) + `rejectActionsFor`(UI용) + `applyBounceTransition`·`applyHoldTransition`·`applyDiscard`(순수) + `holdResultLine`(고정 날짜 문구) + `rejectCommitMessage`. 공유 헬퍼 `locateItem` 추출 후 기존 `applyGateTransition`을 그 위로 리팩터(동작 보존). 임포트 없음 유지 |
| `src/pipeline/transitions.test.mjs` `(수정)` | 반려 화이트리스트·`rejectActionsFor` + bounce/hold/discard 각 해피패스·파서 왕복·최소 diff + 거부 4사유 + 다중 등장 시 최신 행만 + `holdResultLine`(고정 Date) + `rejectCommitMessage`. `$` 포함 사유의 리터럴 삽입. 기존 FEAT-08 테스트는 리팩터 회귀 가드로 그대로 통과 |
| `src/pipeline/commit-transition.ts` `(수정, "use server")` | 공유 플러밍 `commitBoardEdit(makeEdit)` 추출(GET→edit→PUT) 후 기존 `commitGateTransition`을 그 위로 리팩터 + 신규 `commitRejectTransition(action, id, expectedStatus)`(action 분기, 각 순수 함수 호출, `REASON_MESSAGE` 재사용, hold는 `holdResultLine(new Date())`) |
| `src/ui/pipeline-reject.tsx` `(신규, "use client")` | `RejectActions` — 반려 접힘/펼침 + 처리 지시 버튼(되돌리기·보류·폐기) + 폐기 인라인 확인 + `commitRejectTransition` + `useTransition` + 토스트 + `router.refresh()`. 여백 펜 메모 스타일. `type RejectAction`만 임포트(런타임 순수 모듈 임포트 없음) |
| `src/ui/pipeline-page.tsx` `(수정)` | `InboxCard`에 `rejectActions = rejectActionsFor(status)` 도출(`:92-93` 옆) + 메타 행(`:106-117`) 아래 `<RejectActions>` 장착. 임포트에 `rejectActionsFor`·`RejectActions` 추가 |

여기 없는 파일은 고치지 않는다. **`github.ts`·`env.js`·`briefing.ts`·`board.ts`·`commands.ts`·`command-action.ts`·`pipeline-gate.tsx`·`globals.css`·`auth/**`·`middleware.ts`는 건드리지 않는다** — 보드 커밋 좌표·토큰 주석·피드 tone·파서·기존 명령 경로·도장 버튼·CSS 토큰·인가 3중 방어선은 전부 FEAT-08까지로 이미 충분하다. `apps/admin/CLAUDE.md`는 읽기 전용이라 「비고」로 갱신 행을 보고한다.

## 구현 스케치

### 1) `src/pipeline/transitions.ts` (수정) — 반려 화이트리스트 + 순수 함수

기존(변경 없음): `GATE_TRANSITIONS`·`GateFromStatus`·`GateToStatus`·`resolveGateTransition`·`GateTransitionResult`·`escapeRegExp`·`STATUS_LINE_RE`·`BLOCK_END_RE`·`COMMIT_PHRASE`·`gateCommitMessage`.

**(1-a) 공유 헬퍼 `locateItem` 추출 + `applyGateTransition` 리팩터(동작 보존).** 항목 최신(첫) 행의 블록 경계·status prefix/value를 찾는 로직을 헬퍼로 뽑아 승인·반려가 함께 쓴다(정규식 중복 드리프트 방지).

```ts
// 항목 최신(첫) 행 = 가장 위 행(briefing.flatten의 "첫 등장만 유효"와 같은 규칙).
type ItemBlock = {
  headerStart: number; // 헤더 '-'의 위치
  afterHeader: number; // 헤더 줄 다음 '\n' 위치
  blockEnd: number; // 다음 항목/헤딩/안내 블록 직전
  block: string; // [afterHeader, blockEnd)
  statusPrefix: string; // "  status: "
  statusValue: string; // trim된 현재 status
};

function locateItem(
  markdown: string,
  id: string,
): { ok: true; loc: ItemBlock } | { ok: false; reason: "not-found" | "format" } {
  const headerRe = new RegExp(`^- \\[[ xX]\\] ${escapeRegExp(id)}: .+$`, "m");
  const header = headerRe.exec(markdown);
  if (header === null) return { ok: false, reason: "not-found" };
  const headerLine = header[0];
  if (headerLine === undefined) return { ok: false, reason: "not-found" };

  const headerStart = header.index;
  const afterHeader = headerStart + headerLine.length;
  const rest = markdown.slice(afterHeader);
  const endMatch = BLOCK_END_RE.exec(rest);
  const blockEnd =
    endMatch === null ? markdown.length : afterHeader + endMatch.index;

  const block = markdown.slice(afterHeader, blockEnd);
  const status = STATUS_LINE_RE.exec(block);
  if (status === null) return { ok: false, reason: "format" };
  const prefix = status[1];
  const value = status[2];
  if (prefix === undefined || value === undefined) {
    return { ok: false, reason: "format" };
  }
  return {
    ok: true,
    loc: {
      headerStart,
      afterHeader,
      blockEnd,
      block,
      statusPrefix: prefix,
      statusValue: value.trim(),
    },
  };
}
```

`applyGateTransition`을 이 헬퍼 위로 재작성한다 — **분기 순서·거부 사유·치환 결과가 기존과 동일**(FEAT-08 테스트가 회귀 가드):

```ts
// before (:31-69) — locateItem 인라인. after — 헬퍼 사용, 동작 동일.
export function applyGateTransition(
  markdown: string,
  id: string,
  expectedStatus: string,
): GateTransitionResult {
  const to = resolveGateTransition(expectedStatus);
  if (to === null) return { ok: false, reason: "not-whitelisted" };
  const found = locateItem(markdown, id);
  if (!found.ok) return { ok: false, reason: found.reason };
  const { loc } = found;
  if (loc.statusValue !== expectedStatus) return { ok: false, reason: "stale" };
  const newBlock = loc.block.replace(STATUS_LINE_RE, `${loc.statusPrefix}${to}`);
  const newMarkdown =
    markdown.slice(0, loc.afterHeader) + newBlock + markdown.slice(loc.blockEnd);
  return { ok: true, markdown: newMarkdown, to };
}
```

**(1-b) 반려 화이트리스트 + 공통 타입.** 여기가 반려의 보안 경계다. 폐기는 전이가 아니라 행 제거라 `to: null`.

```ts
// 반려(거절) 전이 — 승인(GATE_TRANSITIONS)과 별개 화이트리스트.
// 여기 없는 (action, from) 쌍은 대시보드에서 커밋되지 않는다.
export const REJECT_TRANSITIONS = {
  bounce: { from: ["검토대기"], to: "계획지시" }, // 되돌리기: 계획 재작성
  hold: { from: ["승인대기", "검토대기"], to: "보류" }, // 보류: 대기
  discard: { from: ["승인대기", "검토대기"], to: null }, // 폐기: 행 제거
} as const;

export type RejectAction = keyof typeof REJECT_TRANSITIONS;
export type RejectReason = "not-whitelisted" | "not-found" | "format" | "stale";

type StatusRejectResult =
  | { ok: true; markdown: string; to: string }
  | { ok: false; reason: RejectReason };
type DiscardResult =
  | { ok: true; markdown: string }
  | { ok: false; reason: RejectReason };

// UI용: 이 status에서 가능한 반려 액션(승인대기는 되돌리기 없음).
export function rejectActionsFor(fromStatus: string): RejectAction[] {
  return (Object.keys(REJECT_TRANSITIONS) as RejectAction[]).filter((a) =>
    (REJECT_TRANSITIONS[a].from as readonly string[]).includes(fromStatus),
  );
}
```

**(1-c) 되돌리기(bounce) — status 줄만 교체.** `applyGateTransition`과 같은 기계, 화이트리스트만 다르다.

```ts
export function applyBounceTransition(
  markdown: string,
  id: string,
  expectedStatus: string,
): StatusRejectResult {
  const { from, to } = REJECT_TRANSITIONS.bounce; // to: "계획지시"
  if (!(from as readonly string[]).includes(expectedStatus)) {
    return { ok: false, reason: "not-whitelisted" };
  }
  const found = locateItem(markdown, id);
  if (!found.ok) return { ok: false, reason: found.reason };
  const { loc } = found;
  if (loc.statusValue !== expectedStatus) return { ok: false, reason: "stale" };
  const newBlock = loc.block.replace(STATUS_LINE_RE, `${loc.statusPrefix}${to}`);
  return {
    ok: true,
    to,
    markdown:
      markdown.slice(0, loc.afterHeader) + newBlock + markdown.slice(loc.blockEnd),
  };
}
```

**(1-d) 보류(hold) — status 줄 교체 + `결과:` 줄 기록(있으면 교체·없으면 삽입).** 사유 텍스트는 호출자가 만들어 넘긴다(고정 문구는 `holdResultLine`). `결과:` 기록은 **리터럴 슬라이스**로 한다 — 사유에 `$` 등이 있어도 `.replace` 치환 특수문자로 해석되지 않게(FEAT-08의 "`$` 미포함이라 안전" 논거를 여기선 구조로 보장). **재보류(옛 결과 줄이 남아 있는 항목)에서 줄이 중복되지 않도록 교체 분기를 둔다** — 아래 주석의 실측 근거 참조.

```ts
const REASON_LINE_RE = /^([ \t]+)근거:[ \t]*.*$/m;
const RESULT_LINE_RE = /^([ \t]+)결과:[ \t]*.*$/m;

export function applyHoldTransition(
  markdown: string,
  id: string,
  expectedStatus: string,
  resultText: string,
): StatusRejectResult {
  const { from, to } = REJECT_TRANSITIONS.hold; // to: "보류"
  if (!(from as readonly string[]).includes(expectedStatus)) {
    return { ok: false, reason: "not-whitelisted" };
  }
  const found = locateItem(markdown, id);
  if (!found.ok) return { ok: false, reason: found.reason };
  const { loc } = found;
  if (loc.statusValue !== expectedStatus) return { ok: false, reason: "stale" };

  // 1) status 줄 값 → 보류.
  let newBlock = loc.block.replace(STATUS_LINE_RE, `${loc.statusPrefix}${to}`);

  // 2) 결과 줄 기록. **이미 있으면 교체, 없으면 근거 줄 뒤에 삽입**(둘 다 리터럴 슬라이스).
  //    교체 분기가 필요한 이유: 보류 항목을 재개하면(보드 안내 `PROJECT_BOARD.md:16`) 옛 `결과:` 줄이
  //    남은 채 승인대기·검토대기가 된다. 그때 또 삽입하면 결과 줄이 둘이 되고, board.ts 파서는
  //    순차 대입(`:86-88`)이라 **뒤에 오는 옛 줄이 이긴다** — 새 보류 사유가 화면에서 사라진다.
  //    (검증 라운드 실측: 삽입만 하면 결과 줄 2개, 파서가 옛 사유를 읽음.)
  const existing = RESULT_LINE_RE.exec(newBlock);
  if (existing !== null) {
    const existingLine = existing[0];
    const existingIndent = existing[1];
    if (existingLine === undefined || existingIndent === undefined) {
      return { ok: false, reason: "format" };
    }
    newBlock =
      newBlock.slice(0, existing.index) +
      `${existingIndent}결과: ${resultText}` +
      newBlock.slice(existing.index + existingLine.length);
  } else {
    // 삽입은 `\n`을 쓴다 — 보드 **블롭**이 LF이기 때문(실측 `git ls-files --eol PROJECT_BOARD.md`
    // → `i/lf w/crlf`; contents API는 워킹트리가 아니라 블롭을 서빙하므로 서버가 받는 입력은 LF다).
    // 참고(검증 라운드 실측): CRLF 입력에서도 교체 분기·bounce·discard는 개행이 보존되지만
    // (정규식 `$`가 `\r` 앞에서 매치, 슬라이스가 `\r`을 그대로 둔다) **이 삽입 줄만 LF가 된다.**
    const reason = REASON_LINE_RE.exec(newBlock);
    if (reason === null) return { ok: false, reason: "format" };
    const reasonLine = reason[0];
    const indent = reason[1];
    if (reasonLine === undefined || indent === undefined) {
      return { ok: false, reason: "format" };
    }
    const insertAt = reason.index + reasonLine.length;
    newBlock =
      newBlock.slice(0, insertAt) +
      `\n${indent}결과: ${resultText}` +
      newBlock.slice(insertAt);
  }

  return {
    ok: true,
    to,
    markdown:
      markdown.slice(0, loc.afterHeader) + newBlock + markdown.slice(loc.blockEnd),
  };
}

// 고정 날짜 보류 문구(FEAT-01 보류 기록 형태). 결정론적: 호출자가 Date를 넘긴다.
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
export function holdResultLine(today: Date): string {
  const date = `${today.getUTCFullYear()}-${pad2(today.getUTCMonth() + 1)}-${pad2(today.getUTCDate())}`;
  return `사용자 결정(${date}) — 대시보드에서 보류. 폐기가 아니라 대기이며 TASK_BACKLOG.md에 남는다. 재개하려면 이 행을 계획지시 또는 구현승인으로 되돌린다.`;
}
```

**(1-e) 폐기(discard) — 항목 블록 통째 제거.** 헤더 직전 개행 하나까지 함께 지워 빈 줄이 남지 않게 한다(최소 diff).

```ts
export function applyDiscard(
  markdown: string,
  id: string,
  expectedStatus: string,
): DiscardResult {
  const { from } = REJECT_TRANSITIONS.discard;
  if (!(from as readonly string[]).includes(expectedStatus)) {
    return { ok: false, reason: "not-whitelisted" };
  }
  const found = locateItem(markdown, id);
  if (!found.ok) return { ok: false, reason: found.reason };
  const { loc } = found;
  if (loc.statusValue !== expectedStatus) return { ok: false, reason: "stale" };

  // 헤더 '-' 앞 문자가 '\n'이면 그 개행도 함께 제거 → 이웃 줄이 자연스레 붙는다.
  const cutStart =
    loc.headerStart > 0 && markdown[loc.headerStart - 1] === "\n"
      ? loc.headerStart - 1
      : loc.headerStart;
  return {
    ok: true,
    markdown: markdown.slice(0, cutStart) + markdown.slice(loc.blockEnd),
  };
}
```

**(1-f) 반려 커밋 메시지.** FEAT-08 `gateCommitMessage`와 같은 어미.

```ts
const REJECT_PHRASE: Record<RejectAction, string> = {
  bounce: "bounce {id} back to planning",
  hold: "hold {id}",
  discard: "discard {id}",
};
export function rejectCommitMessage(action: RejectAction, id: string): string {
  return `docs(board): ${REJECT_PHRASE[action].replace("{id}", id)} via dashboard gate`;
}
```

- `noUncheckedIndexedAccess`: `header[0]`·`status[1]`·`status[2]`·`reason[0]`·`reason[1]`은 `string | undefined`라 전부 가드. `REJECT_TRANSITIONS[a]`·`REJECT_TRANSITIONS.bounce`·`REJECT_PHRASE[action]`은 유한 유니온 키라 `undefined`가 안 붙는다. `markdown[loc.headerStart - 1]`은 `string | undefined`지만 `=== "\n"` 비교라 안전.

### 2) `src/pipeline/commit-transition.ts` (수정) — 공유 플러밍 + 반려 액션

기존 GET/PUT 왕복을 `commitBoardEdit(makeEdit)`로 뽑아 승인·반려가 함께 쓴다. `requireAdmin()`은 각 export의 try 밖 최상단에 그대로 둔다(NEXT_REDIRECT 삼킴 방지).

```ts
"use server";

import { env } from "~/env";
import { requireAdmin } from "~/auth/guard";
import { type ActionResult, failure, success } from "~/lib/result";
import { BOARD_BRANCH, BOARD_CONTENTS_URL } from "./github";
import {
  applyBounceTransition,
  applyDiscard,
  applyGateTransition,
  applyHoldTransition,
  gateCommitMessage,
  holdResultLine,
  rejectCommitMessage,
} from "./transitions";

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

const REASON_MESSAGE: Record<string, string> = {
  "not-whitelisted": "허용되지 않은 전이입니다",
  "not-found": "보드에서 항목을 찾지 못했습니다",
  format: "보드 형식을 해석하지 못했습니다",
  stale: "보드가 이미 바뀌었습니다. 새로고침 후 다시 시도하세요",
};

type BoardEdit =
  | { ok: true; markdown: string; message: string }
  | { ok: false; message: string };

// GET(콘텐츠+sha) → makeEdit(순수) → PUT(sha 낙관적 잠금). 토큰·409·오류 문구를 한 곳에.
async function commitBoardEdit(
  makeEdit: (markdown: string) => BoardEdit,
): Promise<ActionResult<void>> {
  const token = env.GITHUB_PIPELINE_TOKEN;
  if (!token) return failure("GitHub 토큰이 설정되지 않았습니다");
  const auth = { ...GITHUB_HEADERS, Authorization: `Bearer ${token}` };

  let getRes: Response;
  try {
    getRes = await fetch(`${BOARD_CONTENTS_URL}?ref=${BOARD_BRANCH}`, {
      headers: auth,
      cache: "no-store",
    });
  } catch (error) {
    console.error("Failed to load board", error);
    return failure("보드를 불러오지 못했습니다");
  }
  if (!getRes.ok) {
    return failure(`GitHub API가 ${getRes.status} 오류로 응답했습니다`);
  }
  const meta = (await getRes.json()) as { content?: string; sha?: string };
  if (typeof meta.content !== "string" || typeof meta.sha !== "string") {
    return failure("보드 콘텐츠를 읽지 못했습니다");
  }
  const markdown = Buffer.from(meta.content, "base64").toString("utf-8");

  const edit = makeEdit(markdown);
  if (!edit.ok) return failure(edit.message);

  let putRes: Response;
  try {
    putRes = await fetch(BOARD_CONTENTS_URL, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: edit.message,
        content: Buffer.from(edit.markdown, "utf-8").toString("base64"),
        sha: meta.sha,
        branch: BOARD_BRANCH,
      }),
    });
  } catch (error) {
    console.error("Failed to commit board edit", error);
    return failure("보드 커밋에 실패했습니다");
  }
  if (putRes.status === 409) {
    return failure("보드가 방금 바뀌었습니다. 새로고침 후 다시 시도하세요");
  }
  if (!putRes.ok) {
    return failure(`GitHub API가 ${putRes.status} 오류로 응답했습니다`);
  }
  return success();
}

// 승인(전진 전이) — 기존 signature·동작 유지, 플러밍만 헬퍼로.
export async function commitGateTransition(
  id: string,
  expectedStatus: string,
): Promise<ActionResult<void>> {
  await requireAdmin();
  return commitBoardEdit((markdown) => {
    const edit = applyGateTransition(markdown, id, expectedStatus);
    if (!edit.ok) {
      return { ok: false, message: REASON_MESSAGE[edit.reason] ?? "전이를 적용하지 못했습니다" };
    }
    return { ok: true, markdown: edit.markdown, message: gateCommitMessage(id, edit.to) };
  });
}

// 반려 — action은 서버가 화이트리스트로 다시 검증(권위는 서버). 클라는 key만 보낸다.
export async function commitRejectTransition(
  action: string,
  id: string,
  expectedStatus: string,
): Promise<ActionResult<void>> {
  await requireAdmin();
  return commitBoardEdit((markdown) => {
    switch (action) {
      case "bounce": {
        const edit = applyBounceTransition(markdown, id, expectedStatus);
        if (!edit.ok) {
          return { ok: false, message: REASON_MESSAGE[edit.reason] ?? "반려를 적용하지 못했습니다" };
        }
        return { ok: true, markdown: edit.markdown, message: rejectCommitMessage("bounce", id) };
      }
      case "hold": {
        const edit = applyHoldTransition(markdown, id, expectedStatus, holdResultLine(new Date()));
        if (!edit.ok) {
          return { ok: false, message: REASON_MESSAGE[edit.reason] ?? "반려를 적용하지 못했습니다" };
        }
        return { ok: true, markdown: edit.markdown, message: rejectCommitMessage("hold", id) };
      }
      case "discard": {
        const edit = applyDiscard(markdown, id, expectedStatus);
        if (!edit.ok) {
          return { ok: false, message: REASON_MESSAGE[edit.reason] ?? "반려를 적용하지 못했습니다" };
        }
        return { ok: true, markdown: edit.markdown, message: rejectCommitMessage("discard", id) };
      }
      default:
        return { ok: false, message: "허용되지 않은 반려 액션입니다" };
    }
  });
}
```

- `REASON_MESSAGE`의 stale 문구를 GET-이후 스테일과 통일하려고 그대로 재사용한다(FEAT-08의 `:15-20`와 같은 4키, not-whitelisted 문구만 "게이트 전이" → "전이"로 일반화 — 승인·반려 공용).
- `holdResultLine(new Date())`는 GET 이후 `makeEdit` 안에서 커밋 시점 날짜로 만든다(서버 계층이라 결정론 불필요; 문구 자체는 순수 테스트로 덮인다).

### 3) `src/ui/pipeline-reject.tsx` (신규, `"use client"`) — 여백 펜 메모

`GateTransitionButton`(`pipeline-gate.tsx`)과 같은 뼈대(`useTransition` + 토스트 + `router.refresh()`)에, 접힘/펼침·폐기 확인 상태를 로컬 `useState`로 둔다. 순수 모듈은 **타입만** 임포트한다(런타임 임포트 없음, `PipelineCommandButton`의 `type PipelineCommandKey` 방식).

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { commitRejectTransition } from "~/pipeline/commit-transition";
import type { RejectAction } from "~/pipeline/transitions"; // 타입만(런타임 임포트 없음)

// 여백 펜 메모: 라벨은 근검정(--foreground, 대비 안전), 뜻은 낱말 + 작은 색 마커(비텍스트).
// 색 일관성: bounce=active(피드 계획지시색) · hold=hold(피드 보류색) · discard=destructive(위험).
const ACTION_META: Record<RejectAction, { label: string; marker: string; toast: string }> = {
  bounce: { label: "계획 다시 쓰기", marker: "bg-active", toast: "계획지시로 되돌렸습니다" },
  hold: { label: "지금은 보류", marker: "bg-hold", toast: "보류했습니다" },
  discard: { label: "폐기", marker: "bg-destructive", toast: "" }, // 폐기 토스트는 아래서 특수 처리
};

export function RejectActions({
  id,
  status,
  actions,
}: {
  id: string;
  status: string;
  actions: RejectAction[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (actions.length === 0) return null;

  const run = (action: RejectAction) => {
    startTransition(async () => {
      const result = await commitRejectTransition(action, id, status);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        action === "discard"
          ? `${id}를 폐기했습니다. TASK_BACKLOG.md 항목은 직접 정리하세요.`
          : ACTION_META[action].toast,
      );
      router.refresh();
    });
  };

  const close = () => {
    setOpen(false);
    setConfirmingDiscard(false);
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        {open ? "반려 닫기" : "반려"}
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-1 border-l-2 border-stamp/30 pl-3">
          {actions.map((action) => {
            if (action === "discard" && confirmingDiscard) {
              return (
                <div key={action} className="flex items-center justify-between gap-2 py-0.5">
                  <span className="text-xs text-[oklch(0.50_0.20_27)]">
                    되돌릴 수 없습니다. 폐기할까요?
                  </span>
                  <span className="flex shrink-0 gap-3">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setConfirmingDiscard(false)}
                      className="text-xs text-muted-foreground hover:underline disabled:opacity-60"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run("discard")}
                      className="text-xs font-medium text-[oklch(0.50_0.20_27)] hover:underline disabled:opacity-60"
                    >
                      {isPending ? "폐기 중..." : "폐기 확인"}
                    </button>
                  </span>
                </div>
              );
            }
            return (
              <button
                key={action}
                type="button"
                disabled={isPending}
                onClick={() =>
                  action === "discard" ? setConfirmingDiscard(true) : run(action)
                }
                className="flex items-center gap-2 py-0.5 text-left text-sm text-foreground hover:underline disabled:opacity-60"
              >
                <span
                  aria-hidden="true"
                  className={`inline-block size-2 rounded-[1px] ${ACTION_META[action].marker}`}
                />
                {ACTION_META[action].label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- 서버는 `action`+`id`+`status`만 받아 화이트리스트를 다시 검사한다(권위는 서버). 클라가 넘기는 것은 key뿐 — 자유 텍스트 없음(보류 사유는 서버가 `holdResultLine`으로 고정 생성).
- 폐기는 `confirmingDiscard`로 한 단계 더(3동작). 되돌리기·보류는 펼침 뒤 1클릭(2동작).
- `ACTION_META[action]`은 유니온 키라 `undefined` 안 붙는다.

### 4) `src/ui/pipeline-page.tsx` (수정) — 반려 장착

`InboxCard`(`:90-130`)에 `rejectActions`를 도출하고 메타 행 아래에 `<RejectActions>`를 둔다. 나머지(발화·도장·근거 `<details>`)는 그대로.

```tsx
// 임포트 (before :5, :7 옆에 추가)
import { rejectActionsFor, resolveGateTransition } from "~/pipeline/transitions";
import { RejectActions } from "~/ui/pipeline-reject";
```

```tsx
// InboxCard 본문 상단 (before :92-93)
  const gateTo =
    item.status === null ? null : resolveGateTransition(item.status);
// after — 반려 액션 목록도 도출(비게이트 status면 빈 배열)
  const gateTo =
    item.status === null ? null : resolveGateTransition(item.status);
  const rejectActions =
    item.status === null ? [] : rejectActionsFor(item.status);
```

```tsx
// 메타 행 (:106-117)은 그대로. 그 닫는 </div> 다음, 근거 <details>(:118) 앞에 삽입:
      {rejectActions.length > 0 && (
        <RejectActions
          id={item.id}
          status={item.status ?? ""}
          actions={rejectActions}
        />
      )}
```

- `pipeline-page.tsx`는 서버 컴포넌트(app/pipeline/page.tsx가 서버 렌더)라 순수 `rejectActionsFor`를 렌더 시점에 호출해도 된다(`resolveGateTransition`과 같은 방식). `RejectActions`(client)는 서버 컴포넌트가 조립한다.
- `status={item.status ?? ""}`: `rejectActions.length > 0`이면 `item.status`는 이미 non-null이지만 타입상 `string | null`이라 `?? ""`로 좁힌다(빈 문자열이 서버로 가도 화이트리스트가 거부).

## 테스트

- **덮는 것 (순수 함수, `transitions.test.mjs`에 추가):**
  - `rejectActionsFor`: `"승인대기"`→`["hold","discard"]`(되돌리기 없음), `"검토대기"`→`["bounce","hold","discard"]`. `"완료"`·`"보류"`·`"계획지시"`·`"구현승인"`·`"arbitrary"`·`""`·`"__proto__"`→`[]`(화이트리스트 밖·프로토타입 오염 키).
  - `applyBounceTransition` 해피패스 + **파서 왕복**: 검토대기 항목 → 계획지시, 재파싱 시 그 항목 status만 바뀌고 나머지 필드·항목 동일. **최소 diff**: 정확히 한 줄(status)만 다름. 거부: 승인대기에서 bounce→`not-whitelisted`(bounce는 검토대기에서만), 스테일(값 불일치)→`stale`, 미발견→`not-found`, status 줄 없음→`format`.
  - `applyHoldTransition` 해피패스 + **파서 왕복**: 승인대기·검토대기 각각 → 보류, 재파싱 시 그 항목 `status="보류"` **및 `result`가 넘긴 resultText와 일치**, 다른 항목 동일. **최소 diff**: 줄 수 +1(결과 줄 삽입), status 줄 1개 변경 + 결과 줄 1개 신규 = 정확히 그 둘만. 결과 줄이 `근거` 바로 다음에 같은 들여쓰기로 삽입됨. **리터럴 삽입**: resultText에 `"a$1b"` 같은 `$`가 있어도 그대로 삽입(정규식 치환 특수문자 미해석). **재보류(옛 `결과:` 줄이 이미 있는 항목)**: 결과 줄이 **하나로 유지**되고(줄 수 +0) 파서가 **새 사유**를 읽는다 — 삽입이 아니라 교체로 가는 분기를 못박는다(검증 라운드에서 삽입만 하면 줄 2개·파서가 옛 사유를 읽는 것이 실측됐다). 거부: 완료에서 hold→`not-whitelisted`, 스테일→`stale`, 미발견→`not-found`, status 줄 없음→`format`.
  - `applyDiscard` 해피패스 + **파서 왕복**: 승인대기·검토대기 항목 제거 후 재파싱 시 그 항목만 사라지고 나머지 항목·필드·순서 동일. **최소 diff(행 제거)**: 결과가 원본에서 그 항목 블록 줄들만 빠진 것과 일치(줄 배열 대조). **다중 등장**: 같은 ID가 두 섹션(최신 검토대기/이력 완료)일 때 discard가 **최신(위) 행만** 제거하고 이력 행은 그대로. 거부: 완료에서 discard→`not-whitelisted`, 스테일→`stale`, 미발견→`not-found`.
  - `holdResultLine`: 고정 `new Date(Date.UTC(2026, 7, 16))` → `"사용자 결정(2026-08-16) — 대시보드에서 보류. 폐기가 아니라 대기이며 TASK_BACKLOG.md에 남는다. 재개하려면 이 행을 계획지시 또는 구현승인으로 되돌린다."` (정확 문자열).
  - `rejectCommitMessage`: `("bounce","FEAT-09")`→`"docs(board): bounce FEAT-09 back to planning via dashboard gate"`, `("hold","FEAT-09")`→`"docs(board): hold FEAT-09 via dashboard gate"`, `("discard","FEAT-09")`→`"docs(board): discard FEAT-09 via dashboard gate"`.
  - **회귀(리팩터 가드)**: 기존 FEAT-08 테스트(`resolveGateTransition`·`applyGateTransition`·`gateCommitMessage`)가 `locateItem` 추출·`commit-transition.ts` 플러밍 리팩터 후에도 그대로 통과. 기존 `BOARD` 픽스처(`:16-59`)를 반려 테스트에도 재사용한다(승인대기 FEAT-01·검토대기 FEAT-05·FEAT-08 다중 등장·status 없는 FEAT-09·완료 BUG-06가 이미 있어 새 픽스처 불필요).
- **못 덮는 범위 (Node 러너·DOM/외부 I/O 없음 — 배포 후 데스크톱+폰 수동 확인):**
  - `commit-transition.ts`의 `commitBoardEdit` GET/PUT·base64·sha 409 분기·`requireAdmin()` 게이트·토큰 미설정·`commitRejectTransition`의 action 분기(실제 GitHub 왕복).
  - `RejectActions`의 `useState`(접힘/펼침·폐기 확인)·`useTransition`·`toast`·`router.refresh()`·클릭·pending 라벨, 여백 펜 메모 시각(세로줄·마커색·`--foreground` 라벨), 폐기 확인 텍스트 잉크 `oklch(0.50 0.20 27)`의 **12px AA 4.5:1 실측**(FEAT-08의 5.20:1 계산 선례대로 B단계 확인) + 마커 `bg-hold`/`bg-active`/`bg-destructive`의 3:1.
  - **투영 지연(FEAT-08과 같은 설계 한계)**: 투영 읽기는 raw CDN(~수분)인데 커밋은 contents API(HEAD)다 — 커밋 성공 후 `router.refresh()`가 raw를 다시 읽어도 처리한 항목이 잠시 결재함에 남을 수 있다. 정합성 문제 아님(스테일 가드는 다음 시도에서 contents API 최신값으로 판정). 성공 토스트가 결과를 확정. FEAT-08 계획 「대안」과 동일 트레이드오프.
- **CLAUDE.md 테스트 표(읽기 전용 — 직접 수정 금지):** `transitions.test.mjs` 행은 이미 있다(`:48`). 이 항목은 **새 파일이 아니라 기존 파일에 테스트 추가**라 파일 수(8)는 그대로고 테스트 수만 는다 — CLAUDE.md의 "8개 파일, 69개 테스트"(`:39`) 중 테스트 수 갱신과 `:48` 행 설명에 "반려 전이(되돌리기·보류·폐기) 화이트리스트·결과 줄 삽입·행 제거·다중 등장" 추가를 B단계 `비고:`로 보고한다. 또 Common Gotchas(`:129`)의 "커밋 경로의 안전은 transitions.ts 화이트리스트가 진다 — 두 전이 외에는 커밋되지 않는다"가 좁아졌으므로(반려 전이 추가) 그 문구 갱신도 함께 보고. **`PROJECT_BOARD.md` 안내 블록(`:7-17`)의 전이 서술도 같은 이유로 갱신 후보다**(「의도적 이탈」 6 — 반려 세 전이가 거기 없다). 안내 블록은 admin-dev 쓰기 범위 밖이라 역시 「비고」로만 보고한다.

## 범위 밖 의존

**코드는 없음** — 전부 `apps/admin/src/**` 안이다. `@repo/db`·다른 워크스페이스·DB 스키마·`packages/db`를 건드리지 않는다. **DB 쓰기 경로는 추가하지 않는다**(읽기 전용 유지). 새 외부 쓰기 **경로(target)도 늘지 않는다** — FEAT-08의 보드 콘텐츠 커밋(contents API) 하나를 재사용하고 편집 종류만 늘린다. 서버 측 호출이라 CSP `connect-src`(브라우저 호출만 대상, CLAUDE.md:127)와 무관하다.

**백로그 파일은 코드가 쓰지 않는다(out-of-scope 준수).** 폐기 시 `TASK_BACKLOG.md` 항목 정리는 사용자 몫이며 토스트로 안내한다 — 이는 담당 에이전트가 파일을 편집하는 B-7(완료 시 자기 항목 제거)과 무관하고, 런타임 코드가 백로그를 커밋하는 경로는 만들지 않는다. 백로그를 함께 커밋하는 안은 「대안」 참조(게이트② 결정 대상).

**코드 밖 전제(막힘이 아니라 사용자 몫):** `GITHUB_PIPELINE_TOKEN`의 Contents RW 권한은 FEAT-08에서 이미 요구·명기됐다 — 반려 세 경로도 같은 보드 콘텐츠 커밋이라 **추가 권한 없음**. 값·권한은 배포 환경 주입(런타임 전제).

## 대안

- **보류 사유를 UI 자유 입력으로** — `결과:`에 소유자가 실제 이유를 남길 수 있어 FEAT-01처럼 맥락이 풍부해진다. 하지만 (1) `결과:`는 파서상 한 줄이라 개행 정리(sanitize)가 필요하고, (2) 자유 텍스트는 `$` 등 치환 특수문자 위험이 있어 리터럴 삽입을 강제하며(순수 함수는 이미 그렇게 설계), (3) 입력 상태·untestable UI가 는다. **기본은 고정 문구**(FEAT-01 형태, 날짜·재개 규칙 포함 — "지금은 안 한다"의 실제 내용과 일치)로 두되, 게이트②에서 켜면 순수 계층은 `sanitize(raw)`+`빈값→고정 폴백`+리터럴 삽입으로 확장 가능(테스트 가능). **채택 안 함(기본)** — 백로그가 "고정 문구로 갈지"를 허용했고, 무게/실수 방지는 펼침+확인 단계가 이미 진다.
- **폐기 시 백로그 항목도 함께 커밋 제거** — "이 항목 자체가 필요없다"의 완전한 실현. 하지만 (1) 세 번째 파일(`TASK_BACKLOG.md`)에 쓰기가 붙어 **두 파일 원자성**(보드 제거 성공·백로그 제거 실패 시 불일치) 처리가 필요하고, (2) 백로그 편집은 백로그가 명시한 별개 항목(out-of-scope)이다. **채택 안 함(기본)** — 보드 행만 제거하고 백로그 정리는 토스트로 안내(백로그가 든 예시). 게이트②에서 켜면 `applyBacklogRemoval` 순수 함수 + 두 번째 PUT을 더한다(부분 성공 토스트 분리 보고 필요).
- **폐기를 status 전이(예: `폐기` status 신설)로** — 행 제거 대신 status만 바꾸면 되돌리기 쉽다. 하지만 백로그 거절 정의 (c)가 "보드 행 제거 + 되돌릴 수 없는 유일한 것"으로 명시했고, 백로그 「참고」도 신규 status를 만들 필요가 없다고 본다. **채택 안 함** — 행 제거로 간다(git revert로 복구 가능하나 의도는 최종).
- **되돌리기에서 계획서를 코드가 지우거나 새 파일명으로** — "재작성"을 파일 조작으로 강제. 하지만 admin-dev A-3 규칙이 이미 "기존 계획서를 읽지 말고 덮어쓴다"라 다음 계획 라운드가 자연히 재작성한다. **채택 안 함** — dev 쪽 동작 변경 없이 status만 `계획지시`로 되돌린다.
- **반려를 도장 버튼 옆 두 번째 버튼(빨강)으로** — 승인/거절을 색 대비(초록/빨강 신호등)로. 하지만 이 세계의 승인은 색 버튼이 아니라 도장 임프린트이고, 거절을 빨강 버튼으로 두면 (1) 은유가 깨지고 (2) 세 갈래(되돌리기·보류·폐기)를 한 버튼에 담을 수 없다. **채택 안 함** — 도장(세리프·솟음) vs 여백 메모(산세리프·평평)의 형태 대비로 가르고, 세 갈래를 펼침 패널에 편다. 빨강은 폐기 하나에만.
