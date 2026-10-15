# BUG-12 — admin 분석 화면 시각 표시의 암묵적 타임존/로케일 의존 제거

## 구현 1회차 (2026-10-15, 완료)

### 배경

`src/fsd/pages/analytics/ui/index.tsx`의 "최근 실패 이벤트" 표 "Last seen" 칸이 `row.lastSeenAt.toLocaleString()`(무인자)로 시각을 그려, 표시가 "UTC"인 이유가 코드가 아니라 배포 환경(Vercel=UTC)에 암묵적으로 의존했다. `toLocaleString()`은 로케일도 런타임에 의존하므로 로케일·타임존을 코드로 고정한다. 계획서 `docs/plans/BUG-12.md`대로 구현.

### 「현재 동작」 확인 (B-3)

구현 전 계획서의 「현재 동작」을 실제 코드와 대조해 일치 확인:

- `index.tsx:236` = `<TableCell>{row.lastSeenAt.toLocaleString()}</TableCell>` — 일치.
- 상단 shared 임포트 블록(`:9-25`, `~/fsd/shared/ui/atoms/...` + `:27` 상대 임포트) — 일치.
- `entities/analytics-event/model/reporting.ts`의 `buildRecentFailureEventsFromEvents`가 `lastSeenAt: Date`(= `event.createdAt`)를 싣고 `.getTime()`으로 정렬 — 일치.
- `shared/lib/`에 `utils.ts`만 존재(기존 `format-date.ts` 없음) — 일치.

어긋남 없음. 구현 진행.

### 고친 파일 (전수)

| 파일 | 변경 | 신규/수정 |
| --- | --- | --- |
| `apps/admin/src/fsd/shared/lib/format-date.ts` | 로케일 `"en"` + 타임존 `"UTC"` 고정 `DATE_TIME_FORMATTER` 상수와 `formatDateTime`. web `format-date.ts`의 date-time 부분만 발췌(date-only `formatDate`/`DATE_FORMATTER`는 admin에 소비자 없어 제외). import-free(전역 `Intl`/`Date`만). | 신규 |
| `apps/admin/src/fsd/shared/lib/format-date.test.mjs` | `process.env.TZ="Asia/Seoul"` 강제 후 동적 임포트. 골든 `"Jul 30, 2026, 10:55 PM"`, `resolvedOptions().timeZone === "UTC"`, `locale === "en"` 완전 일치 3 테스트. 같은 slice 구현 test라 상대 임포트. | 신규 |
| `apps/admin/src/fsd/pages/analytics/ui/index.tsx` | shared 임포트 블록에 `import { formatDateTime } from "~/fsd/shared/lib/format-date";` 추가, `:236`의 `row.lastSeenAt.toLocaleString()` → `formatDateTime(row.lastSeenAt)`. | 수정 |

### 스케치 대비 차이

없음. 신규 `format-date.ts`·`format-date.test.mjs`는 계획서 「구현 스케치」 코드와 동일. `index.tsx`의 임포트 추가 위치는 스케치 지시("기존 shared 임포트 `~/fsd/shared/ui/atoms/...` 블록에 이어 둔다")대로 `table` atom 임포트 직후(상대 임포트 `../lib/...` 앞)에 배치했고, ESLint 임포트 정렬 경고 없이 통과. 분기 순서·조건·리터럴·사용자 문구 변경 없음.

### 검증 (B-5)

세 명령 모두 실제 출력 확인:

- `npm run check -w apps/admin` → EXIT 0 (boundary fixture 13/13, verify:fsd 통과, ESLint `No ESLint warnings or errors`, production tsc 통과).
- `npm test -w apps/admin` → 337 pass / 0 fail / 76 suites. 직전 334/75(29 파일)에서 +3 test·+1 suite·+1 파일 = 신규 `format-date.test.mjs`의 1 파일·1 suite(`describe("format-date")`)·3 test. 회귀 0.
- `npm run verify:fsd:final -w apps/admin` → EXIT 0 (`FSD boundary check passed (final).`).

`git status --short`로 내 변경이 위 3파일뿐임을 확인(그 외 `apps/web/*` 변경은 병행 BUG-18 web-dev 작업, 미접촉).

### 테스트로 못 덮는 범위

- `index.tsx:236`이 실제로 `formatDateTime`을 호출해 화면에 렌더하는지는 Node 러너가 DOM·React 렌더가 없어 판정 못 함. 순수 포매터 계약(고정 출력·`resolvedOptions`)만 러너가 덮고, 호출 연결은 수동 smoke 대상.
- **보이는 형식 변화**: "Last seen" 칸이 런타임 기본 로케일의 `toLocaleString()`(en-US 런타임이면 `7/30/2026, 10:55:46 PM`처럼 초까지)에서 `Jul 30, 2026, 10:55 PM`(월 약칭, 초 없음, UTC 고정)으로 바뀐다. 시각 값(UTC)은 동일, 표기만 변경. 배포 후 수동 확인은 이 형식이 보이는지로 판정(web BUG-10과 같은 형식). 배포 확인 원장 등재 후보.

### 범위 밖 의존

없음. 모든 변경이 `apps/admin/src` 안. `format-date.ts`는 import-free라 DB/fetch/Sentry owner·FSD boundary fixture를 바꾸지 않음. `@repo/db` analytics 계약 미접촉. DB 쓰기 경로 미추가.

### 비고 — CLAUDE.md 테스트 인벤토리 갱신 필요 (읽기 전용이라 직접 수정 안 함)

`apps/admin/CLAUDE.md` `### 테스트 인벤토리`가 "29개 파일, 75개 suite, 334개 test"로 적혀 있으나 이 작업 뒤 **30개 파일, 76개 suite, 337개 test**다. 표에 `src/fsd/shared/lib/format-date.test.mjs` 행(`formatDateTime`/`DATE_TIME_FORMATTER`가 런타임 로케일·TZ와 무관하게 고정 출력·`resolvedOptions()` en/UTC 완전 일치, TZ 강제 후 동적 임포트) 추가가 필요하다.
