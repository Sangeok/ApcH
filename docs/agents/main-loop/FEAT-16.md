# FEAT-16 — 메인 루프 기록

보드가 담지 않는 상세다. 게이트 결정과 계획서 검증 라운드가 여기 쌓인다.
보드에는 요약 판정 한 줄(`검증:`)만 간다 — 그것도 무편집 클린 패스가 나왔을 때만.

---

## 발주 경위 (2026-08-20)

pm 미경유 소유자 직접 발주다. 출처는 `feature-scout` 2차 정찰의 제안 B
(`docs/agents/feature-scout/정찰기록.md`, 2026-08-20 2차 절).

스카우트가 낸 6개 제안(1차 4 + 2차 2) 중 소유자가 이것을 골랐다. 나머지가 밀린 사유:

| 제안 | 사유 |
| --- | --- |
| 유튜브 발행/성과 연동 | **기술적 봉쇄.** 감사 전 `videos.insert`는 업로드 영상을 비공개로 잠근다(공식 문서). 감사는 시연 영상·정책 문서·수 주 심사 — 1인 규모 밖 |
| 업로드 시 자연어 지시 | **기각.** 자연어는 검증 불가, 프롬프트 인젝션 표면 |
| 크레딧 확정 전 프리뷰 | 리뷰가 옵트인 소수 경로(auto 14 : analyze 5). CSS 근사는 블러 배경·얼굴 크롭을 재현 못 해 실제와 어긋난다 |
| 채널 브랜드킷 | 근거가 전방 논증뿐인데 비용 최상(3표면 + Modal 재배포) |

## 메인 루프가 직접 확인한 관측

에이전트 보고를 그대로 받지 않고 대조했다.

- `apps/backend/main.py:1118-1120` — `clip_result["clipType"/"hook"/"payoff"]`를 세팅해 성공 콜백에 싣는다. **확인함**
- `apps/web/src/inngest/functions.ts:119-144` — `normalizeBackendClip`의 반환 객체 9개 필드에 셋이 **전부 없다**. **확인함**
- `packages/db/prisma/schema.prisma` `Clip` — 컬럼이 없었다. **확인함**(선행 작업으로 추가)
- `functions.ts:959` `persist-clip-drafts`가 **`analyzeVideo` 안에만** 있다 → auto 경로 클립에는 대응 `ClipDraft` 행이 없어 조인으로 대체 불가. **확인함**

## 선행 작업 (2026-08-20, 메인 루프 직접 실행)

`packages/db`는 담당 에이전트가 없고 `web-dev`의 금지 목록에 명시돼 있다
(`.claude/agents/web-dev.md:54`, 그리고 `:50` "승인은 범위 승인이지 예외 승인이 아니다").
한 항목으로 발주했으면 계획 단계에서 확정적으로 `보류`가 됐을 것이다. 그래서 쪼갰다.

소유자 승인 후 실행, 커밋 `544ac12`:

- `Clip.clipType` / `Clip.hook` / `Clip.payoff` — 전부 nullable text
- 마이그레이션 `20260820000000_clip_selection_rationale`

**부수 효과 — 소유자에게 사전 보고하고 승인받았다.** `prisma migrate deploy`는 미적용분을
골라서 적용할 수 없다. `20260630000000_one_processing_per_user_index`가 7주간 미적용이었고
(프로덕션 5 / 저장소 6), `pg_indexes` 직접 조회로 그 부분 유니크 인덱스가 **실재하지 않음**을
확인했다. 스키마 주석이 "enforces one processing run per user"라고 전제하던 안전장치다.
적용 시점에 `status='processing'` 행이 0건이라 충돌 없이 걸렸다.

프로덕션 검증: 컬럼 3개 nullable 확인, 인덱스 정의 확인
(`UNIQUE ("userId") WHERE (status = 'processing')`), 마이그레이션 7/7,
기존 `Clip` 102행 무손상(`hook` 전부 NULL).

## 게이트① (2026-08-21)

사용자가 `계획지시`로 전이했다. 메인 루프는 기록만 한다 — 전이 권한은 사용자에게만 있다.

이 시점 보드 미결 2건(FEAT-15 `계획지시` / FEAT-16 `계획지시`). 상한이 2건이라
더 얹을 수 없다. 두 항목은 담당(`admin-dev` / `web-dev`)·워크스페이스·검증 명령이
겹치지 않는다.

## 검증 라운드

(계획서 제출 후 기록)

## 검증 라운드 — `reconciling-proposals-with-codebase`

프로필 Standard. 결함이 하나 나와 bounded 조건이 깨졌으므로 full working evidence로 돌았다.

### 라운드 1 (편집 발생) — 결함 1건

**대조한 것.** 계획서의 `파일:줄` 인용을 전수 재확인했다. 표본이 아니라 전부다.

| 주장 | 결과 |
| --- | --- |
| `main.py:1118-1120`이 세 값을 콜백에 싣는다 | ✅ |
| **auto·render 두 경로 모두** | ✅ `validate_moments`를 만드는 if/else **바깥**에 `for` 루프가 있어 두 분기가 같은 루프로 수렴한다(`main.py:1057-1120`) |
| `route.ts:10-20`/`22-39`/`124-144` 유실 | ✅ `normalizeClip` 반환 9필드에 셋 다 없음 |
| `normalizeAnalyzedMoment`는 이미 보존한다 | ✅ `route.ts:146-169` |
| **두 소비처 모두 벗겨진 값을 받는다** | ✅ `normalizeBody`(`route.ts:193-196`)가 `rawBody.clips`를 `normalizeClip`으로 map하므로 `body.clips`는 정규화본이다. 이벤트(`:246`)와 `updateClipMetadataFromBackendClips`(`:261`) 둘 다 이 값을 받는다 |
| `client.ts:4-14`/`:81`, `AnalyzedMoment`는 이미 가짐(`:33-40`) | ✅ |
| `functions.ts:39-49`/`51-68`/`119-144`/`202-215` | ✅ |
| **`normalizeBackendClips`가 유일 수렴점** | ✅ 호출 전수 1건(`functions.ts:469`), `applyModalPayload` 호출부 3곳(479·505·544)이 전부 이곳으로 온다. 계획서가 인용한 `:482`는 그 호출의 `clips:` 인자 줄로, 오히려 더 정확한 지목이다 |
| `entities/clip/api/index.ts:51-59`/`62-77` | ✅ |
| `schema.prisma:120-122`(Clip)·`157-159`(ClipDraft) | ✅ |
| **읽기 경로가 새 컬럼을 보존한다** | ✅ `db.clip.findMany`에 `select`가 없어 전체 `Clip`이 `ClipDisplay`(`upload-detail/ui/index.tsx:187`)→`ClipCard`로 그대로 간다 |
| `ClipDraftCard.tsx:314-320` clamp+block 실측 주석 | ✅ |
| `selection-budget.test.mjs:7` 명시 확장자 선례 | ✅ |
| **FSD 동일 레이어 peer 임포트 금지** | ✅ `apps/web/CLAUDE.md:98`에 실재. 「대안」의 기각 사유가 근거 있음 |
| `ClipCard.tsx:9`가 이미 자기 슬라이스를 절대경로로 임포트 | ✅ 스케치의 임포트 형식이 기존 관례와 동일 |

**스케치를 실제로 돌렸다.** FEAT-14에서 계획 스케치가 실제 ESLint 게이트에 걸린 전례가 있어, 읽기로
끝내지 않고 원본을 백업한 뒤 스케치를 그대로 적용해 진짜 게이트를 돌렸다.

```
npm run check -w apps/web   → EXIT 0  (✔ No ESLint warnings or errors, tsc 통과)
npm test -w apps/web        → EXIT 0  (51 tests / 12 suites, 기존 45 + 신규 6)
```

`apps/web`도 `stylisticTypeChecked`를 켜므로(`eslint.config.js:20`) FEAT-14를 깬 규칙군이 그대로 적용되는데,
이번 스케치는 통과했다. `./clip-rationale.ts` 명시 확장자 임포트도 tsx 러너에서 실제로 동작했다.
검사 후 5개 파일을 백업본으로 복원했고 `git diff HEAD apps/web/src`가 비어 있음을 확인했다 — 구현은 남기지 않았다.

**정리 중 사고 1건.** 복원 과정에서 `rm -rf .../clip-display/model`을 돌려 기존
`useMetadataClipboard.ts`까지 지웠다. 즉시 `git checkout HEAD --`로 복구했고 `apps/web/src` 전체가
HEAD와 일치함을 재확인했다. 신규 디렉터리만 지운다고 가정한 것이 원인이다.

**결함 1 — 시각 절반의 검증 경로가 실행 불가능하다 (blocker).**

계획서는 `ClipCard` 렌더를 "배포 후 데스크톱+폰 수동 확인"으로만 적었다. 그런데 기존 `Clip` **102행이
세 컬럼 전부 NULL**이다(선행 마이그레이션은 컬럼만 추가하고 과거 행을 채우지 않는다). 따라서 배포 직후
화면의 모든 클립이 `showRationale === false`로 떨어지고, **새로 추가한 블록은 한 번도 렌더되지 않는다.**
확인되는 것은 "카드가 지금과 동일하다"는 회귀 없음뿐이다.

값이 있는 경로를 보려면 파이프라인 실행(GPU 비용) 또는 행 임시 주입(프로덕션 DB 쓰기)이 필요한데
계획서에 그 사실이 없었다. 이대로면 clamp가 죽거나 레이아웃이 깨져도 아무도 모른다 —
`ClipDraftCard.tsx:314-320`이 남긴 실측이 정확히 그 사고다.

→ 「테스트」 절에 전제와 두 선택지를 적고 **어느 쪽을 할지는 사용자가 정한다**고 명시하도록 수정했다.
의도·범위를 바꾸지 않으므로 사용자 결정 없이 반영 가능한 편집이다.

### 라운드 2 (무편집) — 결함 0건

편집이 있었으므로 준비도가 리셋됐다. 저장된 최신본 270줄을 기억이 아니라 **다시 읽어** INV-1~INV-6을
재확인했다. 새 결함 없음. 절 구조가 `docs/plans/template.md`의 7개 절과 순서까지 일치한다.

부수 확인:
- **멱등성** — `clip.createMany({ skipDuplicates: true })`(`entities/clip/api/index.ts:22-24`)와
  `updateMany` + `!= null` 가드(`:65-76`). 이번 변경은 기존 멱등 연산에 선택적 필드를 더할 뿐
  새 변이 경로를 만들지 않는다
- **하위 호환** — 새 필드가 전부 optional이라, 구 스키마로 이미 큐에 들어간 이벤트도 `undefined`→`null`로 떨어진다
- **인가 표면** — 새로 생기거나 이동하는 것이 없다. 같은 웹훅 라우트·같은 인증
- **고아 픽스처** — `normalizeClip`/`normalizeBackendClip`/클립 shape를 단언하는 테스트가 하나도 없다(grep 전수)
- **계측 목적지** — 애널리틱스 이벤트·메타데이터 계약을 건드리지 않는다

**Status: clean pass achieved** — 무편집 최종 패스 1라운드.

### Minimal Replay Anchor

```
문서: docs/plans/FEAT-16.md (270줄, 2026-08-21 시점)
코드 기준: origin/dev 9c99b69 + 미커밋 보드 전이(검토대기)
검증 범위: 고칠 파일 7개 전수, 인용 파일:줄 전수, 읽기 경로 1개, 백엔드 분기 1개
실행 증거: npm run check -w apps/web = EXIT 0 / npm test -w apps/web = EXIT 0 (51 tests)
한계: 이 앵커는 적용 가능성의 기록이지 완전성·무결함의 증명이 아니다.
      wire 왕복과 ClipCard 시각 렌더는 배포 후에만 확인 가능하며 계획서 「테스트」가 그 전제를 명시한다.
```

### 라운드 3 (무편집) — 사용자 지시 재검증, 결함 0건

사용자가 다시 검증을 지시했다. Repeat-Request Routing 규칙상 모호한 "다시 검증"은 replay가 아니라
**전체 캐노니컬 루프**다. 직전 앵커와 대조하지 않고 INV-1~INV-7을 새로 돌렸다.

**지난 라운드에 안 판 곳을 새로 팠다.**

| 새 확인 | 결과 |
| --- | --- |
| `updateClipMetadataFromBackendClips` 호출부 전수 | **2곳**이다 — `route.ts:258`(웹훅)과 **`functions.ts:244`(워커)**. 계획서 「현재 동작」 §1은 웹훅 쪽만 언급한다 |
| └ 그래서 결함인가 | **아니다.** 워커 쪽 호출은 `createClipsBulk` 직후 방금 만든 행을 갱신하는데(`functions.ts:232-249`), 넘기는 `metadataClips` 필터가 `s3Key`만 검사해 세 값을 벗기지 않는다(`:234-240`). 계획서가 고치는 `ClipMetadataPatch`가 이 경로도 함께 덮는다. 동기 경로 전체가 `functions.ts` + `entities/clip`만으로 완결된다 |
| `Clip` 행을 만드는 곳 전수 | 1곳뿐 — `createClipsBulk`(`functions.ts:232` → `entities/clip/api/index.ts:22`). 누락된 쓰기 경로 없음 |
| `ModalWebhookClip` 소비처 전수 | `route.ts` 안 6곳뿐. 파일 밖으로 새지 않는다 |
| `apps/web/CLAUDE.md` 테스트 표를 계획서가 예고해야 하나 | **아니다.** admin-dev 계획서엔 선례가 있으나(FEAT-03·07·08·09), **web-dev는 다르다** — FEAT-02가 같은 상황(신규 테스트 파일)에서 계획서에 안 적었고 B단계 `비고:`로 정상 반영됐다(그 행이 지금 `apps/web/CLAUDE.md:78`에 있다). `web-dev.md:119`가 B단계 의무로 이미 규정한다. 관례 이탈 아님 |
| 코드 드리프트 | **0.** 계획서가 인용하는 10개 파일의 최종 커밋이 전부 검증(88e1f5b) 이전이다. 작업트리도 깨끗 |
| 렌더 분기 정합성 | `hasClipRationale`의 trim 규칙과 `{hook && …}` 개별 진리값 판정이 같은 기준이라 **빈 블록이 렌더될 수 없다**. `showRationale`이 참이면 최소 하나는 반드시 그려진다 |

**저장본 270줄을 다시 읽었다**(기억이 아니라 파일). 편집 0건.

**돌리지 않은 것**: `npm run build -w apps/web`. 이 변경은 새 라우트도 새 CSS도 커스텀 Tailwind 클래스도
만들지 않고(`line-clamp-2`·`text-muted-foreground` 등은 `apps/web`에 이미 쓰인다), 타입 게이트는
라운드 1에서 스케치를 실제 적용해 `tsc --noEmit` 포함 `npm run check`를 EXIT 0으로 통과시켰다.
build가 추가로 잡을 표면이 없다고 판단해 생략했다 — 통과했다고 주장하지 않는다.

**Status: clean pass achieved** — 무편집 2라운드(라운드 2·3).

정직하게 적어 둔다: **"처음부터 문제가 없었다"가 아니다.** 라운드 1에서 blocker 1건(시각 절반의
검증 경로가 실행 불가능)을 찾아 고쳤다. 이번 라운드가 찾은 새 결함이 0건인 것이다.

### Minimal Replay Anchor (라운드 3 갱신)

```
문서: docs/plans/FEAT-16.md (270줄, 88e1f5b 커밋본, 이후 무변경)
코드 기준: origin/dev afd9cb5 — 인용 파일 10개 전부 그 이전 커밋에서 무변경
검증 범위: 고칠 파일 7개, 인용 파일:줄 전수, 쓰기 경로 전수(create 1 / update 2), 읽기 경로 1
실행 증거: (라운드 1) npm run check -w apps/web = EXIT 0 / npm test -w apps/web = EXIT 0 (51 tests)
미실행: npm run build -w apps/web (근거는 위)
한계: 적용 가능성의 기록이지 완전성·무결함의 증명이 아니다. wire 왕복과 시각 렌더는 배포 후에만 확인 가능하다.
```

### 라운드 4 (무편집) — 사용자 지시 재검증, 결함 0건

또 replay가 아니라 전체 루프다. **라운드 3이 남긴 구멍 셋**을 메웠다.

| 새 확인 | 결과 |
| --- | --- |
| **`npm run build -w apps/web`** — 라운드 3에서 "안 돌렸다"고 명시했던 유일한 미실행 게이트 | **EXIT 0.** 스케치를 다시 적용해 실제 프로덕션 빌드를 돌렸다. 라우트 트리 정상 방출, 타입 검사 포함 통과 |
| `ClipDisplay`가 `clip`을 가공하나 | **아니다.** `widgets/clip-display/ui/index.tsx`가 `Clip[]`을 받아 `optimisticClips.map`으로 `ClipCard`에 **객체 그대로** 넘긴다. 매핑·subset 타입이 없어 새 컬럼이 안 벗겨진다 — 읽기 경로가 DB부터 카드까지 끊김 없이 확정됐다 |
| `ClipDraftCard.tsx:22-30` 인용이 정확한가 | ✅ `:22-26`이 "프롬프트의 요청일 뿐 강제 장치가 없어 다른 값이 올 수 있으니 매핑에 없으면 원본을 그대로" 주석이고 `:27-30`이 `CLIP_TYPE_LABELS = { qa: "Q&A", insight: "Insight" }`다. 계획서 신규 모듈이 이 규칙을 그대로 복제했다 |
| `upload-detail/ui/index.tsx:187` | ✅ 정확히 `<ClipDisplay clips={clips} />` |

복원 검증: `git diff HEAD apps/web/src` 비어 있음. 라운드 1의 사고(폴더 통째 삭제)를 반복하지 않도록
이번엔 디렉터리가 아니라 생성한 파일 하나만 지웠고, 기존 `useMetadataClipboard.ts` 보존을 직접 확인했다.

**최종 패스**: 이 패스에서 결함이 0건이라 Bounded 조건이 성립하므로, 저장본에 대한 **확인 재독**
(전면 재도출이 아님)으로 마쳤다. 문서는 `88e1f5b` 커밋본에서 무변경임을 git으로 확인했다.

**Status: clean pass achieved** — 무편집 3라운드(2·3·4).

여전히 **"처음부터 문제가 없었다"가 아니다.** 라운드 1의 blocker 1건이 실재했고 고쳤다.
라운드 2·3·4가 각각 새 각도로 팠으나 새 결함이 안 나온 것이다.

### 실행 증거 누적

```
npm run check -w apps/web   EXIT 0   (라운드 1, 스케치 적용 상태)
npm test -w apps/web        EXIT 0   (라운드 1, 51 tests / 12 suites)
npm run build -w apps/web   EXIT 0   (라운드 4, 스케치 적용 상태)
```
세 게이트 전부 스케치를 실제 적용한 상태에서 돌렸고, 매번 복원 후 `git diff HEAD apps/web/src`가
비어 있음을 확인했다. 구현은 한 번도 남기지 않았다.

## 게이트② (2026-08-21)

사용자가 `구현승인`으로 전이했다. 메인 루프는 기록만 한다 — 전이 권한은 사용자에게만 있다.

전제는 충족돼 있었다: 보드에 `검증: 클린 패스 (2026-08-21, 무편집 1라운드)`가 있고,
그 뒤 사용자 지시로 두 라운드(3·4)를 더 돌려 결함 0건을 재확인했다.
계획서는 `88e1f5b` 커밋본에서 무변경이며 인용 파일 10개도 드리프트 0이다.

담당 `web-dev`에게 구현을 발주한다. 「고칠 파일」 7개(수정 5 · 신규 2) 밖으로 나가면 보류다.

## 인수 (2026-08-21)

에이전트 보고를 받아들이지 않고 **다섯 조건을 메인 루프가 직접 재현**했다.

**① 변경 파일 ↔ 「고칠 파일」** — 선언 7 / 실제 7. 선언했으나 미변경 0, 선언 밖 변경 0.
(`apps/web/.claude/settings.local.json`이 목록에 잡히지만 이 세션 착수 전부터 변경돼 있던 파일이고
에이전트도 자기 작업이 아니라고 밝혔다. 커밋하지 않는다.)

**② diff ↔ 「구현 스케치」** — 5개 파일 **추가 58줄 · 삭제 0줄**(순수 가산). 계획서 코드블록 10개에서
추출한 줄 집합과 대조해 차이가 둘뿐이었고, 둘 다 무해함을 개별 확인했다:

| 차이 | 판정 |
| --- | --- |
| `clip-rationale.ts` L4 주석: 계획 `(「대안」 참조)` → 실제 `(FEAT-16 계획서 「대안」 참조)` | 코드가 아니라 주석. 코드에서 「대안」만 쓰면 가리키는 곳이 없어 **명확해진 쪽**이다. 나머지 줄은 바이트 동일 |
| `ClipCard` 임포트가 1줄이 아니라 prettier 다중행(트레일링 콤마 포함) | 형식 차이. 합치면 계획서 문장과 동일하며 prettier print width상 이 형태가 정상이다 |

**③ 검증 명령 직접 재실행** — 에이전트가 돌렸다는 결과가 아니라 내 셸에서:

```
npm run check -w apps/web   EXIT 0   ✔ No ESLint warnings or errors
npm test -w apps/web        EXIT 0   # tests 51 / # suites 12 / # pass 51 / # fail 0
npm run build -w apps/web   EXIT 0   라우트 트리 정상 방출
```

**④ 백로그 제거** — `TASK_BACKLOG.md`에 `FEAT-16` 문자열 0건.

**⑤ 상세 기록 실재** — `docs/agents/web-dev/FEAT-16.md` 5,229바이트, 절 7개.
`web-dev` 폴더의 첫 보고서다(규약대로 첫 보고서가 폴더를 만든다).

보드 행: `- [x]` / `status: 완료` / `결과` 148자(150 예산 내) / `검증:` 줄 보존.

### 메인 루프가 대신 처리한 것

`apps/web/CLAUDE.md`는 `web-dev` 읽기 전용이라 「비고」로 넘어왔다. 두 가지 반영:

1. `:69` "현재 7개 파일, 45개 테스트" → **"8개 파일, 51개 테스트"** (내가 실행한 러너 출력과 일치)
2. 테스트 목록 표에 `widgets/clip-display/model/clip-rationale.test.mjs` 행 추가

### 남은 것 — 사용자 몫

배포 후에도 **기존 `Clip` 102행은 세 컬럼이 NULL**이라 모든 카드가 `showRationale === false`로 떨어진다.
새 근거 블록이 실제로 그려지는 것을 보려면 계획서 「테스트」가 적은 둘 중 하나가 필요하다:
(a) 파이프라인 1회 실주행(GPU 비용) 또는 (b) 기존 행에 임시 값 주입 후 되돌리기(프로덕션 DB 쓰기).
**어느 쪽을 할지는 사용자가 정한다.** 이 절차를 건너뛰면 clamp·레이아웃 결함이 조용히 남는다.
