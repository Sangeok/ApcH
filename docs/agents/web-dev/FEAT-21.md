# FEAT-21 — 번역 폴백 안내의 웹 절반 (`subtitleStatus` 소비·클립 카드 안내)

## 2026-08-26 — 구현 (web-dev)

계획서 `docs/plans/FEAT-21.md`(구현승인, 클린 패스 커밋 `cfe7ab7`)를 파일에서 다시 읽고
「고칠 파일」·「구현 스케치」대로 구현했다. 전제였던 `Clip.subtitleStatus String?` 컬럼은
선행 적용 완료(커밋 `19dda69`) — `schema.prisma:127`·생성 클라이언트 `index.d.ts`에 반영 확인.

### 고친 파일 전수 (수정 5 / 신규 2)

**수정**

1. `apps/web/src/app/api/webhooks/modal/route.ts`
   - `ModalWebhookClip`에 `subtitleStatus?: string | null;` 추가
   - `RawModalWebhookClip`에 `subtitleStatus?: string | null;` 추가 (camelCase만 — snake 변형 없음, `hook`/`payoff`와 동일)
   - `normalizeClip` 반환에 `subtitleStatus: rawClip.subtitleStatus ?? null,` 추가
   - `RawAnalyzedMoment`는 건드리지 않음 (같은 `payoff` 3필드 블록이라 문맥으로 구분)
2. `apps/web/src/inngest/client.ts`
   - `ProcessVideoBackendClip`(이벤트 페이로드 타입)에 `subtitleStatus?: string | null;` 추가
3. `apps/web/src/inngest/functions.ts`
   - `ProcessVideoBackendClip`·`RawProcessVideoBackendClip` 타입에 각각 `subtitleStatus?: string | null;` 추가
   - `normalizeBackendClip` 반환에 `subtitleStatus: rawClip.subtitleStatus ?? null,` 추가
   - `persistGeneratedClips` create 데이터(`Prisma.ClipCreateManyInput`)에 `subtitleStatus: clip.subtitleStatus ?? null,` 추가
4. `apps/web/src/fsd/entities/clip/api/index.ts`
   - `ClipMetadataPatch`에 `subtitleStatus?: string | null;` 추가
   - `toClipMetadataUpdateData` 마지막 스프레드로 `...(clip.subtitleStatus != null ? { subtitleStatus: clip.subtitleStatus } : {})` 추가 (기존 `!= null` 가드 규칙 그대로 — 존재값 안 지움)
5. `apps/web/src/fsd/widgets/clip-display/ui/_component/ClipCard.tsx`
   - `import { AlertTriangle } from "lucide-react";` 추가
   - `import { subtitleFallbackNotice } from "~/fsd/widgets/clip-display/model/subtitle-status";` 추가 (기존 `clip-rationale` 임포트 바로 아래)
   - 파생값 `const fallbackNotice = subtitleFallbackNotice(clip.subtitleStatus);` 추가 (`showRationale` 아래)
   - `<ClipVideoPlayer … />`와 `{showRationale && (` 사이에 amber 안내 블록 삽입 (null이면 블록 없음 → 카드 회귀 없음)

**신규**

6. `apps/web/src/fsd/widgets/clip-display/model/subtitle-status.ts`
   - `subtitleFallbackNotice(subtitleStatus)` 순수 함수 + `SUBTITLE_FALLBACK_NOTICES` 맵.
     `"partial-fallback"`/`"full-fallback"`만 안내, `"ok"`·미지·nullish/공백은 `null`.
7. `apps/web/src/fsd/widgets/clip-display/model/subtitle-status.test.mjs`
   - 7개 테스트: 두 폴백 상태 매핑 / `"ok"`→null / 미지값→null / nullish→null /
     빈·공백→null / **padded `" partial-fallback "`→안내(trim 존재 이유)** / wire 계약 회귀 가드.

### 스케치 대비 차이

없음. 분기 순서·조건·리터럴 값·안내 문구 2종(영어 원문)·매핑 키 2종(`"partial-fallback"`·
`"full-fallback"`) 전부 스케치 그대로. 임포트 배치·className·`aria-hidden` 등 상용구도 스케치 일치.
「고칠 파일」 표 밖(`packages/db`·`ClipDraftCard.tsx`·조회 경로 `uploaded-file/api`·`clip-rationale.ts`)
은 건드리지 않았다.

### 검증 (실제 실행)

```
npm run check -w apps/web   → EXIT=0  (next lint: No ESLint warnings or errors / tsc --noEmit 통과)
npm test  -w apps/web       → EXIT=0  # tests 58 # pass 58 # fail 0 (suites 14)
```

기준선 51 → 58 (신규 7). 파일 8 → 9. `git status` 확인: 수정 5 + 신규 2만 변경(harness
`.claude/settings.local.json`은 세션 시작 시점부터 M 상태로 FEAT-21 무관).

### 못 덮는 범위 (계획서 「테스트」 절 그대로 — 현 Node 러너·DOM/외부 I/O 없음)

- `route.ts`·`functions.ts`의 파서(`normalizeClip`/`normalizeBackendClip`) — `~/env`·`server-only`·
  Prisma 의존으로 tsx 러너 로드 불가. 기존 파서도 같은 이유로 무테스트(현 상태 유지).
- `persistGeneratedClips` create·`toClipMetadataUpdateData` update의 실제 DB 반영(Prisma·외부 I/O).
- `ClipCard`의 안내 블록 렌더·amber 색·`AlertTriangle`·null 분기(React/DOM 없음) — 수동 확인.
  **배포만으로는 안내가 뜨는 경로를 볼 수 없다.** 기존 `Clip` 행은 새 컬럼 NULL →
  `fallbackNotice===null`, 새 클립도 번역이 실제 실패해야 `"partial-fallback"`/`"full-fallback"`이
  실린다. 안내 화면 확인엔 (a) 번역 실패 소스 실주행(GPU+크레딧, 실패 비결정적) 또는
  (b) 기존 행에 상태값 임시 주입 후 되돌리기(프로덕션 DB 쓰기) 중 하나 필요 — 어느 쪽인지는
  사용자가 정한다. 배포 직후 확인되는 것은 "정상 클립 카드가 지금과 동일"(회귀 없음)뿐.
- 백엔드→웹훅→이벤트→DB 전 구간 wire 왕복.
- (기록) `trimmed.length === 0` 가드는 맵 조회 폴백(`?? null`)과 등가라 제거 돌연변이 사멸 불가
  (등가 돌연변이 — 명세 구멍 아님). 테스트 미작성, 의도 문서화용으로 코드 유지.

### apps/web/CLAUDE.md 테스트 표 handoff (읽기 전용이라 직접 수정 못 함 — 메인 루프/사용자 반영 요망)

- 「현재 8개 파일, 51개 테스트」 → 「현재 9개 파일, 58개 테스트」로 갱신.
- 표에 새 행 1개 추가:

  | `widgets/clip-display/model/subtitle-status.test.mjs` | 번역 폴백 상태 → 사용자 안내 매핑. `"partial-fallback"`/`"full-fallback"`만 안내를 내고 `"ok"`·미지값·nullish/공백은 null인 것(정상 자막에 경고 안 붙임), padded 상태값도 `trim()`으로 매핑되는 것을 잡는다. **매핑 키는 백엔드 `translation_fallback.py` 상태 상수와 묶는 wire 계약이라 어긋나면 안내가 조용히 꺼진다** — 이 회귀를 타입이 아니라 이 테스트가 막는다 |
