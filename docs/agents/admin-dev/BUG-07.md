# BUG-07 — admin-dev 구현 보고

## 2026-08-27 — 구현 (완료)

### 무엇을 했나

`/pipeline` "당신의 책상" 배너의 라벨이 폰 뷰포트에서 판독 불가 크기로 축소되던 문제를,
계획서(`docs/plans/BUG-07.md`)의 채택안(라벨 분리)대로 구현했다. 배너 텍스트(제목·부제)를
스케일되는 SVG 유저 좌표계에서 완전히 빼내고, `aria-hidden` 배경 SVG 위에 절대배치한 일반
HTML 텍스트 오버레이로 옮겼다. 텍스트는 이제 컨테이너 폭 스케일과 무관하게 고정 px(`text-sm`·
`text-xs`) 크기를 유지한다.

### B-3 대조 (계획서 「현재 동작」 vs 현 코드)

계획서가 인용한 모든 지점이 현 코드와 정확히 일치했다 — 어긋남 없음.

- `owner-banner.tsx:25` `viewBox="0 0 660 96"`, `:29` `className="w-full"`(width/height 없음) — 일치
- 제목 `fontSize={15}` `fontWeight={700}` `fill="#2b2420"`(`:67-76`), 부제 `fontSize={12}`
  `fill="#976014"`(`:77-85`), 둘 다 x=200 — 일치
- 배경 책상 프레임 `x=57` `width=60`(→57~117), `:48-56` — 일치
- 호출부 `InboxZone`의 `<OwnerBanner pendingCount={pendingCount} />`(`ui/index.tsx:143`),
  조상 컨테이너 `mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8`(`ui/index.tsx:37`) — 일치

### 고친 파일 (전수)

| 파일 | 변경 |
| --- | --- |
| `apps/admin/src/fsd/pages/pipeline/ui/_component/owner-banner.tsx` | 루트를 `<div className="relative">`로 감싸고, SVG를 `role="img"`·`aria-label` 제거 후 `aria-hidden="true"` 순수 장식으로 낮춤. 두 `<text>` 요소를 SVG에서 제거하고, `</svg>` 뒤에 `pointer-events-none absolute inset-0 flex flex-col justify-center gap-1 pl-[30.3%] pr-3` 오버레이 `<div>` 안 `<p>` 둘(제목 `text-sm leading-tight font-bold`·부제 `text-xs leading-snug`)로 라벨 렌더. 색상 hex·폰트 계열은 원값 그대로. |

다른 파일은 손대지 않았다. `git diff --name-only`로 워킹트리 변경이 이 파일 하나임을 확인
(그 외 `apps/web/.claude/settings.local.json`은 세션 시작 전부터 변경돼 있던 것으로 내 작업과 무관).

### 스케치 대비 차이

- **분기 순서·조건·리터럴 값·사용자 문구**: 스케치와 동일. `subtitle` 삼항식, `pl-[30.3%]`,
  `text-sm`/`text-xs`, 색상 `#2b2420`/`#976014`, 폰트 계열, 노출 문구("당신의 책상" 및 subtitle
  두 분기) 모두 계획서 그대로.
- **인덴트만 차이**: 스케치는 새 opening 태그만 재인덴트를 보였으나, SVG 본문(rect/g/map)이
  이제 `<div>` 안으로 한 단계 더 중첩되므로 본문 전체를 그 깊이에 맞춰 재인덴트했다. 인덴트는
  스케치가 판단 대상으로 삼는 넷(분기·조건·리터럴·문구)에 해당하지 않는 순수 서식 변경이다.

### 테스트

- 계획서 「테스트」 절대로 **새 테스트 없음**. `subtitle` 삼항식은 자명한 리터럴 분기라 순수
  함수로 뽑지 않는다(계획서 근거). 테스트 인벤토리(27파일/60suite/281test) 변동 없음 —
  `apps/admin/CLAUDE.md`의 `### 테스트 인벤토리` 갱신 불필요.

### 검증 (실제 출력 확인)

| 명령 | 결과 |
| --- | --- |
| `npm run check -w apps/admin` | exit 0 (`verify:fsd:test` 13 pass · `verify:fsd` 통과 · `next lint` 경고/에러 0 · `tsc --noEmit` 통과) |
| `npm test -w apps/admin` | exit 0 — tests 281 / suites 60 / pass 281 / fail 0 |
| `npm run verify:fsd:final -w apps/admin` | exit 0 — "FSD boundary check passed (final)." |

### 테스트로 못 덮은 범위 (수동 smoke)

Node 내장 러너는 DOM이 없어 실제 렌더 픽셀 크기·오버레이-배경 정렬·`pl-[30.3%]`가 브라우저에서
텍스트를 책상 서류함 프레임 밖에 두는지를 확인할 수 없다(test-runtime-contract: DOM client
interaction manual). 배포 후 폰 375px·320px·데스크톱 세 폭에서 스크린샷으로 (1) 라벨 판독성,
(2) 제목·부제가 배경 그림과 겹치지 않는 정렬, (3) 세로 중앙 정렬을 수동 확인해야 한다 —
`docs/release-checks.md` 등재 대상(계획서 「못 덮는 범위」와 동일).
