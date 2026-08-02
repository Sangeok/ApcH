---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-07-30"
approved-by: null
approved-at: null
approval-scope: null
completed-at: "2026-07-30"
verification-summary: "마이그레이션 전 문서. 개별 검증 기록 없음"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related: []
---

# 클립 검토(Review Needed) UX 후속 개선 — 선택 예산 모델링 + 막다른 길 제거 기능 개발 문서

Date: 2026-07-29
Status: **Implemented** (2026-07-29) — PR [#72](https://github.com/Sangeok/ApcH/pull/72)
선행 문서: `clip-review-ux-improvements-2026-07-21.md`, `pre-generation-clip-editing-2026-07-20.md` (같은 폴더)

분류: **feature** — 기존 동작 보존이 목적이 아니라 선택 가능 범위·차단 방식·계측을 바꾸는 작업이다.

## 구현 결과 (2026-07-29)

§5의 모든 Phase를 적용했다. `npm run check`·`npm run build` 통과, 단위 테스트 11 pass(신규 `selection-budget.test.mjs` 5개 포함).

| Phase | 상태 |
|---|---|
| 1a 의존성 없는 계측 | ✅ |
| 1b 나머지 계측 2종 | ✅ |
| 2 선택 예산 | ✅ |
| 3 겹침 시각화 | ✅ |
| 4 막다른 길 + 문구 | ✅ |
| 5 키보드 접근성 | ✅ |

**계획 대비 편차 3건**

1. **Phase 2와 3을 한 커밋에 함께 적용했다.** §4.2의 `getGenerateBlockReason`이 `overlappingCount`를 받는 형태로, §4.4의 카드 props가 두 값을 함께 받는 형태로 쓰여 있어, 쪼개려면 이 문서에 없는 중간 버전을 지어내야 했다. Phase 4·5는 얽힘이 없어 그대로 분리 적용했다.
2. **`ANALYTICS_PATH`를 위젯이 아니라 훅에서 `REVIEW_ANALYTICS_PATH`로 export한다.** §4.10은 위젯 파일 상단에 두라고 했으나 Phase 1a에서 훅도 같은 경로를 쓴다. 리터럴을 두 파일에 복제하는 대신 한 곳에서 내보내 갈라질 여지를 없앴다.
3. **전사 단어 `<button>`에 `inline`을 명시했다.** §7 리스크 표가 지목한 "버튼 기본값 `inline-block`이 문단 흐름을 바꾼다"에 대한 대응이다.

**구현 중 발견한 것 (이 문서 범위 밖이라 별도 커밋)**

`getSafeUploadMetadata`가 `reviewBeforeGenerate`를 `upload_started` 페이로드에 **이미 싣고 있었으나** 허용 목록에 없어 `sanitizeAnalyticsMetadata`가 조용히 버리고 있었다 — 이 문서 §4.10이 경고한 실패 모드가 기존 코드에서 실제로 일어나던 사례다. 허용 키를 추가하고, 이벤트를 전혀 쏘지 않던 Generation 토글에도 형제 핸들러와 동일한 발화를 붙였다(`a24d310`). 이로써 Open Questions의 "Review first 비율 미측정" 항목이 해소된다.

**여전히 미확인**: 실제 화면을 렌더해 보지 못했다(seed 스크립트 부재). 아래 Open Questions 참조.

---

## 1. 배경/동기

### 비즈니스 맥락 (사용자 브리프)

검토(`review_pending`) 단계가 사용자가 쓰기에 적합한지 UX 관점에서 점검하고 개선한다. 이 단계는 사용자가 크레딧을 실제로 소모하는 지점이므로, 여기서의 막다른 길은 곧 이탈이다.

### 기술적 맥락 (코드베이스에서 확인한 현재 동작)

**(0) 검토 단계는 선택 기능이고 기본값은 꺼짐이다.** — 이하 모든 항목의 전제

```prisma
// prisma/schema.prisma:81
reviewBeforeGenerate  Boolean  @default(false)
```

업로드 폼의 "Review first / Auto" 토글이 이 값을 정하고(`pages/dashboard/ui/_component/UploadPodcast.tsx:205`), 꺼져 있으면 `"auto"` 모드로 디스패치되어(`features/upload/api/index.ts:170`) `review_pending`을 거치지 않고 바로 렌더까지 간다.

**이 문서의 개선은 전부 "Review first"를 켠 업로드에만 적용된다.** 검토를 켜는 비율 자체가 얼마인지는 현재 측정되지 않으며(§1-(5)), 이 문서의 계측이 그 분모를 처음으로 만들어 준다. 계측 설계(§4.9)가 기존 activation 퍼널을 건드리지 않는 이유도 이 조건부 경로 때문이다.

**(1) draft 개수는 목표 개수와 무관하다 — 백엔드는 2배를 요청할 뿐이다.**

백엔드가 목표의 2배를 요청한다. 다만 이는 프롬프트의 요청이고(`main.py:904`
`Return exactly TARGET_COUNT moments if possible`) slice나 padding 같은 강제
장치가 없으므로, 실제 draft 개수는 모델이 반환한 값이다 — 목표보다 많을 수도,
적을 수도 있다. 실제로 목표 4에 draft 7개가 관측되었다(2026-07-30). 이 문서의
설계는 개수 자체에 의존하지 않는다: 예산은 `targetClipCount`로만 계산하고
`selectUpToBudget`은 `slice(0, limit)`이라 draft가 상한보다 적어도 동작한다.

```python
# ai-podcast-clipper-backend/main.py:983
identified_moments_raws = self.identify_moments(transcript_segments, clip_count * 2)
```

목표 개수는 4개 값 중 하나이고 기본값은 3이다.

```ts
// src/fsd/shared/config/constants.ts:20-25
export const CLIP_COUNT_OPTIONS = [
  { value: 1, label: "1 clip" },
  { value: 2, label: "2 clips" },
  { value: 3, label: "3 clips" },
  { value: 4, label: "4 clips" },
] as const;
```

```prisma
// prisma/schema.prisma:79
targetClipCount       Int      @default(3)
```

즉 사용자는 **항상 2N개 후보 중 N개**를 고른다 (1→2, 2→4, 3→6, 4→8).

**(2) 그 결과 `Select all`은 어떤 설정에서도 성공할 수 없다.**

`Select all`은 전체를 선택하므로 항상 2N개가 되고, 상한은 N이므로 즉시 차단 상태가 된다.

```ts
// src/fsd/widgets/clip-draft-review/ui/index.tsx:49-51
  if (selectedCount > targetClipCount) {
    return `You can generate up to ${targetClipCount} clips for this upload.`;
  }
```

이 버튼은 선행 라운드(`clip-review-ux-improvements-2026-07-21.md` §2 목표 5)가 의도적으로 추가한 것이다. 그 문서는 2N 생성 규칙과 대조하지 않았다. **설계 결함이 아니라 직전 개선이 만든 회귀다.**

**(3) 예산 규칙이 UI에 모델링되어 있지 않다.**

상한은 헤더의 `text-xs` 안내 문구에만 있고, 위반은 비활성 버튼 아래 사후 오류로 통보된다. `Select all`을 쓰지 않고 수동으로 N+1개를 체크해도 동일한 막다른 길에 빠진다.

```tsx
// src/fsd/widgets/clip-draft-review/ui/index.tsx:153-157
          <p className="text-muted-foreground mt-1 text-xs">
            Pick up to {targetClipCount} moments, fine-tune each range, then
            generate. Each generated clip uses 1 credit — you have{" "}
            {currentUserCredits}.
          </p>
```

**(4) 차단 사유가 보이지만 해소 경로가 없다.**

`getGenerateBlockReason`(`ui/index.tsx:35-59`)은 4종 사유를 문구로 노출한다. 그러나

- 크레딧 부족: 충전 경로(빌링) 링크가 없다.
- 겹침: **어떤 클립이 겹치는지 표시가 없다.** 카드가 최대 8개인데 시간 배지를 수동 대조해야 한다.

서버 가드도 동일한 4종이다(`src/fsd/features/upload/api/index.ts:434-460` — 0개 선택 `:434`, 상한 초과 `:438`, 크레딧 부족 `:444`, 겹침 `:448-460`).

**(5) 검토 단계에 계측이 하나도 없다.**

이벤트 카탈로그 23종에 검토 관련 이벤트가 없다.

```ts
// src/fsd/shared/analytics/event-catalog.ts:16-19
  "processing_scheduled",
  "processing_schedule_failed",
  "upload_detail_viewed",
  "clip_viewed",
```

activation 퍼널에도 검토 단계가 없다. 다만 (0) 때문에 이건 퍼널의 결함이 아니다 — auto 모드가 기본이므로 **activation 퍼널에는 검토 단계가 없는 게 맞다.** 문제는 검토를 켠 경로를 **어디서도** 볼 수 없다는 것이다.

```ts
// src/fsd/entities/analytics-event/model/funnels.ts:12-19
  activation: [
    "dashboard_viewed",
    "upload_file_selected",
    "upload_started",
    "upload_s3_completed",
    "processing_scheduled",
    "clip_viewed",
  ],
```

**이게 특히 문제인 이유:** 선행 라운드는 P1 항목(마스터-디테일 레이아웃, 타임라인 트리밍, 9:16 크롭+자막 오버레이 프리뷰, sticky 플레이어)을 **"사용 데이터 확인 후 별도 결정"**으로 미뤘다(선행 문서 §2 비목표). 그런데 그 데이터를 만드는 이벤트를 함께 넣지 않았다. 결정을 데이터에 걸어두고 데이터 수집을 시작하지 않은 상태다.

**(6) 프리뷰가 무엇과 다른지 말하지 않는다.**

캡션 프리뷰는 실제 영상 프레임이 아니라 그라디언트 박스이고, 안내는 무엇이 어떻게 다른지 말하지 않는다.

```tsx
// src/fsd/widgets/clip-draft-review/ui/_component/CaptionStyleEditor.tsx:219-221
        <p className="text-center text-[11px] text-muted-foreground">
          Preview is approximate — final render may differ.
        </p>
```

실제 렌더는 **프레임마다 active speaker를 따라가는 세로 크롭**이다.

```python
# ai-podcast-clipper-backend/main.py:191-237 (요지)
max_score_face = max(current_faces, key=lambda face: face['score']) if current_faces else None
if max_score_face: mode = "crop"
center_x = int(max_score_face['x'] * scale if max_score_face else frame_width // 2)
image_cropped = resized_image[0:target_height, top_x:top_x+target_width]
```

트래킹 결과(`tracks.pckl`/`scores.pckl`)는 렌더 중에 생성되므로 **검토 시점에는 존재하지 않는다.** 따라서 충실한 크롭 프리뷰는 저비용 클라이언트 작업이 아니며, 고정 크롭 가이드를 그리면 실제와 다른 정보를 보여주게 된다. 선행 라운드가 P1로 미룬 판단이 옳았다.

---

## 2. 목표 상태

### 목표

1. **선택 예산의 일급화** — 남은 슬롯을 헤더에 명시하고, 예산이 찼을 때 미선택 체크박스를 비활성화해 **무효 상태를 만들 수 없게** 한다. `Select all`은 예산 안에서 동작하는 형태로 교체한다. 상한은 `targetClipCount`만이며(§3 결정 2), 그 계산과 소비 지점을 한 함수로 모아 정책이 바뀌어도 UI가 따라오게 한다. **크레딧은 선택을 제한하지 않는다** — 목표 3이 그걸 해소 경로로 다룬다.
2. **겹침 시각화** — 겹치는 카드가 어느 것인지 카드 위에서 식별되게 한다.
3. **크레딧 막다른 길 제거** — 크레딧 부족 사유에 빌링 경로를 붙인다.
4. **프리뷰 기대치 정정** — 무엇이 다른지(세로 크롭 + 화자 추적) 문구로 명시한다.
5. **검토 단계 계측** — 열람·선택·차단(사유별)·확정 이벤트를 심고 **별도 `review` 퍼널**을 만든다. 기존 activation 퍼널은 손대지 않는다 — 검토는 조건부 경로라 섞으면 auto 모드 사용자의 지표가 깨진다(§1-(0), §4.9). 선행 라운드가 P1을 걸어둔 "사용 데이터"의 수집을 시작한다.
6. **커스텀 클립 키보드 조작** — 단어 선택을 키보드로 가능하게 한다.

### 비목표

- **9:16 크롭 + 자막 오버레이 프리뷰** — 선행 라운드 P1이며, §1-(6)에서 확인했듯 트래킹 데이터가 검토 시점에 없어 충실한 구현이 불가능하다. 목표 4는 이를 대체하는 게 아니라 **P1이 오기 전까지 기대치를 정직하게 맞추는** 임시 조치다.
- **상한 정책 자체의 변경** — 선택 상한은 `targetClipCount`를 유지한다(§3 결정 2에서 확정). 크레딧으로 완화하는 건 별도 제품 결정이며 이번 범위가 아니다. 이번 작업은 "현재 상한을 UI가 정확히 표현한다"까지다.
- **서버 액션·Prisma 스키마·백엔드 변경 없음** — `saveClipDraftEdit`/`confirmClipDraftsAndGenerate`/`addCustomClipDraft`(`src/fsd/features/clip-review/api/index.ts`, `src/fsd/features/upload/api/index.ts`)를 그대로 재사용한다. 계측 이벤트 추가는 프론트엔드 카탈로그 변경이다.
- **접근성 전반** — shadcn Checkbox 도입 등은 선행 라운드 P3로 남는다. 목표 6은 그중 **기능 전체가 닫히는** 한 건만 떼어낸 것이다(현재 커스텀 클립 추가는 키보드로 도달 불가).
- **저장 모델 재설계** — 자동 저장/낙관적 갱신 구조(선행 라운드 결정 1)는 유지한다.
- **`applyStyleToAll`·`setAllSelection`의 벌크 서버 액션화** — 선행 라운드 P3. 순차 N회 왕복은 유지한다.

### 성공 기준

관찰 가능한 기준. **전제: 업로드 시 "Review first"를 켜야 검토 화면에 도달한다**(§1-(0), 기본값은 Auto).

- 목표 개수 3(기본값)인 업로드에서 6개 draft가 보이고, **상위 3개가 이미 선택된 채로 열린다**(`inngest/functions.ts:950`). 즉 첫 렌더의 기본 상태가 예산 가득이며, 나머지 3개 체크박스는 그 시점부터 비활성이다. 헤더는 이를 오류가 아니라 "교체하려면 하나 빼라"로 설명한다.
- 선택을 하나 해제하면 미선택 체크박스가 다시 활성화되고, 다시 채우면 잠긴다.
- 상한 초과 사유(`You can generate up to N clips`)가 **정상 조작으로는 발생하지 않는다.** (서버 가드는 방어선으로 그대로 둔다.)
- **크레딧은 선택을 잠그지 않는다.** 크레딧 1 / 목표 3인 계정에서도 3개를 선택할 수 있고, 차단은 Generate 시점에만 걸린다 — 서버(`upload/api/index.ts:444`) 및 현재 동작과 동일하다.
- 크레딧이 선택 개수보다 적을 때 차단 문구 옆에 `/dashboard/billing` 링크가 보이고 클릭 시 이동한다. 크레딧이 목표보다 적은 계정은 **첫 렌더부터** 이 상태다(미리 선택된 개수가 목표와 같으므로).
- 크레딧 0인 계정에서도 체크박스가 잠기지 않고, 선택된 상태이므로 빌링 링크에 도달할 수 있다(막다른 길 없음).
- 구간을 겹치게 조정하면 겹치는 두 카드 모두에 겹침 표시가 나타나고, 해소하면 사라진다.
- 캡션 프리뷰 하단 문구가 세로 크롭과 화자 추적을 명시한다.
- (Phase 1a) 검토 화면 진입/커스텀 클립 추가/확정 시 대응 이벤트가 기록되고, 관리자 분석 화면에 **`Clip Review` 퍼널 버튼이 새로 나타나며** 세 단계가 집계된다. **`Upload Activation` 퍼널의 각 단계 수치는 변경 전과 동일하다**(검토 이벤트를 넣지 않았으므로).
- (Phase 1b) 선택 변경과 차단 사유가 기록된다. 특히 **구간이나 캡션 스타일만 수정했을 때는 `clip_review_selection_changed`가 기록되지 않는다** — 체크박스 토글과 `Fill`/`Clear`에서만 기록된다.
- 커스텀 클립 패널에서 Tab으로 단어에 도달하고 Enter/Space로 선택할 수 있다.
- `npm run check` 통과 (`next lint && tsc --noEmit`, `package.json:12`).
- `selection-budget.test.mjs`의 계약 불변식 통과 (§8).

---

## 3. 대안 분석

### 결정 1: 상한 초과를 어떻게 막을 것인가

**Option A: 예산 도달 시 미선택 체크박스 비활성화 + `Select all`을 예산 내 동작으로 교체 (선택)**

- 장점: 무효 상태가 **구조적으로 발생하지 않는다.** 차단 사유 4종 중 2종(상한 초과, 그리고 상한이 크레딧에 묶인 경우 크레딧 부족)이 정상 경로에서 사라진다. 서버 가드는 그대로 두므로 안전성 손실 없음.
- 단점: 비활성 체크박스는 이유가 안 보이면 혼란스럽다 → 헤더의 남은 슬롯 표시와 비활성 사유 툴팁/문구가 함께 있어야 한다.

**Option B: 현행 유지 + 안내 문구만 강화**

- 장점: 변경 최소.
- 단점: 사후 통보 구조가 그대로다. `Select all`이 항상 무효인 문제도 해결되지 않는다.

**Option C: 초과 선택을 허용하고 확정 시 상위 N개 자동 선택**

- 장점: 사용자가 자유롭게 체크할 수 있다.
- 단점: **사용자가 고르지 않은 것을 시스템이 고른다.** 크레딧이 걸린 액션에서 침묵의 자동 선택은 신뢰를 깬다. 선행 라운드가 확인 다이얼로그까지 넣은 방향(결정 2)과도 어긋난다.

**선택: Option A** — 근거: 이 화면의 과제는 언제나 "2N 중 N 고르기"라는 고정 예산 선택이다. 예산형 과제의 표준 해법은 사후 검증이 아니라 입력 제한이고, 서버 가드가 이미 있어 UI 제한이 최후 방어선이 아니다.

### 결정 2: 체크박스를 잠그는 상한을 무엇으로 둘 것인가

**Option A: `targetClipCount`만 (선택)**

- 장점: 서버와 동작이 일치한다 — 서버는 크레딧을 **생성 시점에만** 막고(`upload/api/index.ts:444`) 선택은 제한하지 않는다. 현재 UI 동작도 그대로 보존된다(§2 비목표 "상한 정책 변경 없음"). 크레딧 부족 사용자는 선택을 마친 뒤 차단 사유와 **빌링 링크**를 보게 되어, 목표 3의 유도 경로가 살아 있다. `targetClipCount`는 1~4(`constants.ts:20-25`)라 `limit`이 0이 될 수 없어 "용량 0" 예외 상태 자체가 생기지 않는다.
- 단점: 크레딧으로 못 만들 클립을 일단 고를 수 있다. 다만 그건 오늘과 같고, 서버가 최종 방어한다.

**Option B: `min(targetClipCount, credits)`로 선택 자체를 제한**

- 장점: 살 수 없는 클립을 아예 못 고르게 한다.
- 단점: **서버보다 엄격해진다** — 서버가 허용하는 선택을 UI가 막는다. 크레딧을 사도록 유도하는 대신 하드 캡으로 차단해 목표 3과 충돌한다. 그리고 크레딧 0이면 `limit === 0` → 아무것도 선택 못 하는데 헤더는 "다 썼으니 하나 해제하라"고 안내하는 자기모순 상태가 되어, **이 문서가 없애려는 막다른 길을 되살린다.** 이를 피하려면 0 용량 분기를 따로 만들어야 한다.

**선택: Option A** — 근거: 선택 상한(재업로드해야 풀림)과 지불 능력(충전으로 풀림)은 성격이 다른 제약이고, 후자는 막는 것보다 해소 경로를 보여주는 게 맞다. 서버가 이미 그렇게 나눠 놓았다.

> 이 결정으로 `SelectionBudget`에서 `limitSource`가 사라진다. 유효 상한이 하나뿐이므로 "무엇이 나를 묶고 있는가"를 표현할 필요가 없어졌다.

### 결정 3: 겹침 표시 방식

**Option A: 겹치는 카드에 인라인 표시 (선택)**

- 장점: 기존 카드 구조 안에서 끝난다. 사용자가 고쳐야 할 대상 바로 옆에 표시된다.
- 단점: 카드가 스크롤 밖이면 안 보인다 → 헤더 차단 문구에 겹치는 개수를 함께 표기해 보완한다.

**Option B: 선택 구간 타임라인 스트립 신규 도입**

- 장점: 겹침이 시각적으로 자명하고, 영상 전체에서 어디를 뽑았는지라는 새 정보를 준다.
- 단점: 선행 라운드가 P1(타임라인/드래그 트리밍)로 미룬 영역과 겹친다. 여기서 부분 도입하면 P1 설계를 선점해버린다.

**선택: Option A** — 근거: P1 타임라인 설계를 침범하지 않으면서 막다른 길만 해소한다.

---

## 4. 구현 계획

### 신규 코드

| 파일 | 역할 |
|------|------|
| `src/fsd/widgets/clip-draft-review/model/selection-budget.ts` | 유효 상한·남은 슬롯·겹침 판정의 단일 지점 |
| `src/fsd/widgets/clip-draft-review/model/selection-budget.test.mjs` | 위 계약 불변식 테스트 (`node:test`) |

### 기존 코드 수정

#### 4.1 `src/fsd/widgets/clip-draft-review/model/selection-budget.ts` (신규)

```ts
import type { ClipDraft } from "generated/prisma";

/**
 * 선택 예산. **선택만** 다루며 크레딧은 포함하지 않는다.
 *
 * 크레딧을 상한에 접지 않는 이유: 서버는 크레딧을 **생성 시점에만** 막고
 * (features/upload/api/index.ts:444) 선택 자체는 제한하지 않는다. 클라이언트가
 * 크레딧으로 체크박스를 잠그면 서버보다 엄격해지고, 크레딧을 사도록 유도하는
 * 대신 하드 캡으로 막게 된다. 크레딧은 getGenerateBlockReason의 별도 사유다.
 *
 * ⚠️ 상한 규칙은 서버 가드가 함께 강제한다(:438 target, :444 credits).
 *    나중에 상한 정책을 바꾸게 되면 **이 함수와 서버 가드를 함께** 고쳐야 한다.
 *    이 함수만 고치면 UI가 허용한 선택을 서버가 거부하는 상태로 조용히 갈라진다.
 *
 * 파라미터를 전체 ClipDraft가 아니라 실제로 읽는 필드로만 좁힌다 —
 * 이 모듈이 Prisma 스키마 변경의 영향권에 들어가지 않게 한다.
 */
export interface SelectionBudget {
  /** 선택 상한 = targetClipCount. CLIP_COUNT_OPTIONS가 1~4이므로 항상 1 이상이다. */
  limit: number;
  selectedCount: number;
  remaining: number;
  isFull: boolean;
}

export function getSelectionBudget(input: {
  clipDrafts: Pick<ClipDraft, "selected">[];
  targetClipCount: number;
}): SelectionBudget {
  const { clipDrafts, targetClipCount } = input;
  const selectedCount = clipDrafts.filter((draft) => draft.selected).length;
  const remaining = Math.max(0, targetClipCount - selectedCount);

  return {
    limit: targetClipCount,
    selectedCount,
    remaining,
    isFull: remaining === 0,
  };
}

/**
 * 겹치는 draft의 id 집합. **호출부가 선택된 draft만 넘겨야 한다** —
 * 이 함수는 selected를 읽지 않는다.
 *
 * 파라미터 이름이 아니라 이름 자체로 전제를 드러내기 위해 내부에서 필터하지 않고
 * `drafts`로 명명한다. 백엔드가 항상 목표의 2배를 인접 구간으로 만들기 때문에,
 * 전체 clipDrafts를 넘기면 선택하지 않은 카드까지 겹침으로 표시된다.
 *
 * 겹침 규칙의 원본은 3곳이 함께 바뀌어야 한다: 백엔드 identify_moments의
 * non-overlap 제약 → 서버 가드(features/upload/api/index.ts:448-460) → 이 함수.
 * 기존 위젯의 hasOverlap(ui/index.tsx:96-104)을 대체한다.
 */
export function getOverlappingDraftIds(
  drafts: Pick<ClipDraft, "id" | "startSeconds" | "endSeconds">[],
): Set<string> {
  const sorted = [...drafts].sort((a, b) => a.startSeconds - b.startSeconds);
  const overlapping = new Set<string>();

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const next = sorted[i]!;

    if (next.startSeconds < prev.endSeconds) {
      // 겹침은 쌍의 속성이므로 양쪽 모두 표시한다.
      overlapping.add(prev.id);
      overlapping.add(next.id);
    }
  }

  return overlapping;
}
```

> 불변식: `getOverlappingDraftIds(x).size > 0`은 기존 `hasOverlap`(`ui/index.tsx:96-104`)이 `true`인 경우와 정확히 일치해야 한다. 판정 조건(`next.startSeconds < prev.endSeconds`)과 정렬 기준을 그대로 옮겼다.
>
> `limit`이 `targetClipCount`와 같아진 이상 이 필드는 값을 더하지 않아 보이지만, 상한의 **소비 지점**을 한 곳으로 모아 두는 역할을 한다 — 헤더 문구·체크박스 잠금·`Fill N slots`가 모두 `budget.limit`을 읽으므로, 상한 정책이 바뀌면 이 함수 하나(와 서버 가드)만 손대면 된다.

#### 4.2 `src/fsd/widgets/clip-draft-review/ui/index.tsx`

변경 import:

```tsx
import Link from "next/link";
import { trackAnalyticsEvent } from "~/fsd/shared/analytics";
import {
  getOverlappingDraftIds,
  getSelectionBudget,
  type SelectionBudget,
} from "../model/selection-budget";
```

> `useEffect`/`useRef`는 이 파일이 이미 import하고 있다(`:3`). §4.10의 발화 이펙트가 추가로 필요로 하는 건 없다.
>
> ⚠️ **Phase별로 필요한 import가 다르다.** 위 블록은 최종 형태이므로 Phase 1a에서 통째로 넣으면 아직 없는 `../model/selection-budget`을 import해 모듈 해석에 실패한다. Phase 1a에는 `trackAnalyticsEvent`만, Phase 2에 `selection-budget`, Phase 4에 `next/link`를 추가한다.

Before (차단 사유 계산 + 겹침 판정, `:35-59` / `:88-113`):

```tsx
function getGenerateBlockReason({
  selectedCount,
  targetClipCount,
  currentUserCredits,
  hasOverlap,
}: {
  selectedCount: number;
  targetClipCount: number;
  currentUserCredits: number;
  hasOverlap: boolean;
}): string | null {
  if (selectedCount === 0) {
    return "Select at least one clip to generate.";
  }
  if (selectedCount > targetClipCount) {
    return `You can generate up to ${targetClipCount} clips for this upload.`;
  }
  if (currentUserCredits < selectedCount) {
    return `Not enough credits — need ${selectedCount}, you have ${currentUserCredits}.`;
  }
  if (hasOverlap) {
    return "Selected clips must not overlap.";
  }
  return null;
}
```

After:

```tsx
// 차단 사유의 종류. 사유별 후속 UI(빌링 링크)와 계측 메타데이터(reason)가
// 같은 값을 쓰도록 한 곳에서 정의하고 export한다 — 계측 쪽이 문자열을
// 다시 쓰지 않고 이 타입을 참조하게 해서 주석이 아니라 컴파일러가 묶는다.
export type BlockKind = "empty" | "credits" | "limit" | "overlap";

// 서버 가드(features/upload/api/index.ts:434-460)의 클라이언트 미러.
// 순서도 서버와 같다: 0개 → 상한 → 크레딧 → 겹침.
//
// 크레딧은 budget에 들어 있지 않다. 선택을 제한하지 않고 생성만 막기 때문이다
// (selection-budget.ts 주석 참고). 그래서 인자로 따로 받는다.
function getGenerateBlockReason({
  budget,
  currentUserCredits,
  overlappingCount,
}: {
  budget: SelectionBudget;
  currentUserCredits: number;
  overlappingCount: number;
}): { message: string; kind: BlockKind } | null {
  if (budget.selectedCount === 0) {
    return { message: "Select at least one clip to generate.", kind: "empty" };
  }
  // 예산 UI가 입력 단계에서 막으므로 정상 조작으로는 도달하지 않지만,
  // 낙관적 갱신 도중의 과도 상태를 위해 사유는 남겨둔다.
  if (budget.selectedCount > budget.limit) {
    return {
      message: `You can generate up to ${budget.limit} clips for this upload.`,
      kind: "limit",
    };
  }
  // 크레딧 부족은 정상 경로에서 도달한다 — 검토 화면은 목표 개수만큼 미리
  // 선택된 채로 열리므로(inngest/functions.ts:950), 크레딧이 목표보다 적은
  // 사용자는 첫 렌더부터 이 사유를 본다. 빌링 링크가 붙는 지점이다.
  if (currentUserCredits < budget.selectedCount) {
    return {
      message: `Not enough credits — need ${budget.selectedCount}, you have ${currentUserCredits}.`,
      kind: "credits",
    };
  }
  if (overlappingCount > 0) {
    return {
      message: `${overlappingCount} selected clips overlap. Adjust the highlighted ranges.`,
      kind: "overlap",
    };
  }
  return null;
}
```

파생값 Before (`:88-113`, 컴포넌트 본문):

```tsx
  const selectedDrafts = useMemo(
    () => clipDrafts.filter((draft) => draft.selected),
    [clipDrafts],
  );
  const selectedCount = selectedDrafts.length;

  // 겹침 규칙의 원본은 3곳이 함께 바뀌어야 한다: 백엔드 identify_moments의
  // non-overlap 제약 → 서버 가드(features/upload/api/index.ts:447-454) → 이 미러.
  const hasOverlap = useMemo(() => {
    const sorted = [...selectedDrafts].sort(
      (a, b) => a.startSeconds - b.startSeconds,
    );
    return sorted.some(
      (draft, index) =>
        index > 0 && draft.startSeconds < sorted[index - 1]!.endSeconds,
    );
  }, [selectedDrafts]);

  const generateBlockReason = getGenerateBlockReason({
    selectedCount,
    targetClipCount,
    currentUserCredits,
    hasOverlap,
  });

  const canGenerate = !isConfirming && generateBlockReason === null;
```

After — 겹침 판정과 예산 계산을 `selection-budget.ts`로 옮기고, 겹치는 id 집합을 카드에 내려보낸다:

```tsx
  const selectedDrafts = useMemo(
    () => clipDrafts.filter((draft) => draft.selected),
    [clipDrafts],
  );

  const budget = useMemo(
    () => getSelectionBudget({ clipDrafts, targetClipCount }),
    [clipDrafts, targetClipCount],
  );

  // Before의 selectedCount를 유지한다. 이 컴포넌트의 나머지(헤더 카운트 :151,
  // clipNoun/creditNoun :142-143, 확인 다이얼로그 :163,:170-174)가 이 이름을
  // 그대로 쓰고 있어, 지우면 그 6곳이 미정의 식별자가 된다.
  // budget에서 파생시켜 같은 값이 두 경로로 계산되지 않게 한다.
  const selectedCount = budget.selectedCount;

  // Before의 hasOverlap(boolean)을 id 집합으로 바꾼다. 판정 조건은 동일하고,
  // 어떤 카드가 겹치는지 표시하기 위해 대상을 잃지 않고 유지한다.
  // getOverlappingDraftIds는 selected를 읽지 않으므로 선택된 것만 넘긴다.
  const overlappingDraftIds = useMemo(
    () => getOverlappingDraftIds(selectedDrafts),
    [selectedDrafts],
  );

  const generateBlockReason = getGenerateBlockReason({
    budget,
    currentUserCredits,
    overlappingCount: overlappingDraftIds.size,
  });

  const canGenerate = !isConfirming && generateBlockReason === null;
```

> 참고: 위 Before의 주석은 서버 가드 위치를 `:447-454`로 적고 있으나 실제 겹침 가드는 `:448-460`이다(현재 소스에서 확인). 이 주석은 `selection-budget.ts`로 옮기면서 정정한다 — §4.1의 주석이 정정본이다.

> 불변식: `generateBlockReason === null`이 되는 조건 집합은 Before와 정확히 같아야 한다. 4종 사유의 판정식(0개 / 상한 / 크레딧 / 겹침)과 **평가 순서**를 그대로 옮겼고, `targetClipCount`·`currentUserCredits`가 각각 독립 게이트로 남는 것도 Before·서버(`:438`/`:444`)와 동일하다.

Before (헤더 안내 + Select all/Deselect all, `:145-234` 중 해당 부분):

```tsx
          <p className="text-muted-foreground mt-1 text-xs">
            Pick up to {targetClipCount} moments, fine-tune each range, then
            generate. Each generated clip uses 1 credit — you have{" "}
            {currentUserCredits}.
          </p>
```

```tsx
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isSettingSelection}
              onClick={() => selectAll()}
            >
              Select all
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isSettingSelection}
              onClick={() => deselectAll()}
            >
              Deselect all
            </Button>
          </div>
```

After:

```tsx
          <p className="text-muted-foreground mt-1 text-xs">
            {/* 화면은 목표 개수만큼 이미 선택된 채로 열린다
                (inngest/functions.ts:950). 즉 첫 렌더의 기본 상태가
                remaining === 0이므로, 이 문구는 오류가 아니라 정상 상태를
                설명해야 한다 — "다 썼다"가 아니라 "바꾸려면 교체하라". */}
            {budget.remaining > 0
              ? `${budget.selectedCount} of ${budget.limit} picked. ${budget.remaining} left.`
              : `${budget.limit} of ${budget.limit} picked — swap one out to change your pick.`}
            {` Each clip uses 1 credit; you have ${currentUserCredits}.`}
          </p>
```

```tsx
          <div className="flex items-center justify-end gap-2">
            {/* draft는 항상 목표의 2배(main.py:983)라 "전체 선택"은 성립하지
                않는다. 예산만큼만 위에서부터 채운다. */}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isSettingSelection || budget.isFull}
              onClick={() => selectUpToBudget(budget.limit)}
            >
              Fill {budget.limit} slots
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isSettingSelection || budget.selectedCount === 0}
              onClick={() => deselectAll()}
            >
              Clear selection
            </Button>
          </div>
```

크레딧 차단 시 빌링 경로 (Before는 `:193-197`):

```tsx
          {generateBlockReason && (
            <p className="text-destructive max-w-[260px] text-right text-xs">
              {generateBlockReason}
            </p>
          )}
```

After:

```tsx
          {generateBlockReason && (
            <div className="max-w-[260px] text-right">
              <p className="text-destructive text-xs">
                {generateBlockReason.message}
              </p>
              {generateBlockReason.kind === "credits" && (
                <Link
                  href="/dashboard/billing"
                  className="text-primary text-xs underline underline-offset-2"
                >
                  Buy credits
                </Link>
              )}
            </div>
          )}
```

훅 호출부 Before (`:73-86`) — 구조 분해 이름과 **인자 개수가 함께 바뀐다.** §4.10이 시그니처에 세 번째 인자를 추가하므로, 여기를 안 고치면 `TS2554: Expected 3 arguments, but got 2`로 빌드가 깨진다.

⚠️ **아래 After는 Phase 2 완료 시점의 최종 형태다.** 세 번째 인자는 Phase 1a에서 이미 추가되고, 이름 변경(`selectAll` → `selectUpToBudget`)만 Phase 2 몫이다. Phase 1a에 이 블록을 통째로 적용하면 아직 없는 `selectUpToBudget`을 구조 분해하게 된다 — 중간 상태는 §4.10 상단 참조.

```tsx
  const {
    transcriptWords,
    saveDraft,
    applyStyleToAll,
    confirmAndGenerate,
    addCustomClip,
    selectAll,
    deselectAll,
    isConfirming,
    isApplyingToAll,
    isAddingCustom,
    isSavingDraft,
    isSettingSelection,
  } = useClipDraftReview(uploadedFileId, clipDrafts);
```

After:

```tsx
  const {
    transcriptWords,
    saveDraft,
    applyStyleToAll,
    confirmAndGenerate,
    addCustomClip,
    selectUpToBudget,
    deselectAll,
    isConfirming,
    isApplyingToAll,
    isAddingCustom,
    isSavingDraft,
    isSettingSelection,
  } = useClipDraftReview(uploadedFileId, clipDrafts, { targetClipCount });
```

> `budget`을 통째로 넘기지 않는 건 순환을 피하기 위해서다 — `budget`은 `getSelectionBudget(clipDrafts, targetClipCount)`의 결과라 훅에 넘기면 같은 값을 두 경로로 들고 다니게 된다. 훅은 원본인 `targetClipCount`만 받는다.

카드 호출부 Before (`:240-251`):

```tsx
          {clipDrafts.map((draft) => (
            <ClipDraftCard
              key={draft.id}
              draft={draft}
              isActive={draft.id === activeDraftId}
              language={language}
              transcriptWords={transcriptWords}
              onPreview={(range) => handlePreview(draft.id, range)}
              onSave={saveDraft}
              onApplyToAll={applyStyleToAll}
              isApplyingToAll={isApplyingToAll}
            />
          ))}
```

After:

```tsx
          {clipDrafts.map((draft) => (
            <ClipDraftCard
              key={draft.id}
              draft={draft}
              isActive={draft.id === activeDraftId}
              language={language}
              transcriptWords={transcriptWords}
              onPreview={(range) => handlePreview(draft.id, range)}
              onSave={saveDraft}
              onApplyToAll={applyStyleToAll}
              isApplyingToAll={isApplyingToAll}
              isOverlapping={overlappingDraftIds.has(draft.id)}
              isBudgetFull={budget.isFull}
            />
          ))}
```

> 새 동작으로 표시: `selectUpToBudget`는 기존 `selectAll`을 대체하는 신규 액션이다. 검사한 코드에 없던 분기이므로 §4.3에서 훅에 추가한다. "위에서부터 N개"의 순서 규칙은 확인 완료 — `clipDrafts`는 Gemini 랭킹 순으로 정렬되어 오므로(`inngest/functions.ts:941,950` → `clip-draft/api/index.ts:37`의 `orderBy: { index: "asc" }`) `slice(0, limit)`이 곧 상위 N개다. 근거는 §4.3 주석에 있다.

#### 4.3 `src/fsd/widgets/clip-draft-review/model/use-clip-draft-review.ts`

Before (`:190-238`, 전체 선택/해제 뮤테이션):

```ts
  // 전체 선택/해제. applyStyleMutation과 같은 순차 루프 패턴을 따르되,
  // 단일 카드 토글(saveMutation)과 동일하게 낙관적 갱신으로 헤더 카운트를
  // 즉시 일치시킨다. 일부만 성공한 채 실패할 수 있으므로 onSettled에서
  // 성공/실패 모두 서버 상태로 재동기화한다.
  const setAllSelectionMutation = useMutation({
    mutationFn: async (selected: boolean) => {
      // 이미 같은 값이면 건너뛰는 최적화를 두어선 안 된다. mutationFn은
      // onMutate가 detail 캐시의 모든 draft.selected를 낙관적으로 뒤집은 뒤에
      // 실행되고, 그 사이 리렌더가 끼면 여기 clipDrafts가 갱신된 값으로
      // 교체되어 전부 skip될 수 있다(= 서버에 아무것도 저장되지 않음).
      // applyStyleMutation과 동일하게 대상 전체를 무조건 저장한다.
      for (const draft of clipDrafts) {
        const result = await saveClipDraftEdit({
          clipDraftId: draft.id,
          startSeconds: draft.startSeconds,
          endSeconds: draft.endSeconds,
          selected,
        });
        if (!result.success) {
          throw new Error(result.error);
        }
      }
    },
    onMutate: async (selected) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<UploadedFileDetail>(detailKey);

      if (previous) {
        queryClient.setQueryData<UploadedFileDetail>(detailKey, {
          ...previous,
          clipDrafts: previous.clipDrafts.map((draft) => ({
            ...draft,
            selected,
          })),
        });
      }

      return { previous };
    },
    onSettled: invalidateDetail,
    onError: (error, _selected, context) => {
      if (context?.previous) {
        queryClient.setQueryData(detailKey, context.previous);
      }
      toast.error(
        error instanceof Error ? error.message : "Failed to update selection",
      );
    },
  });
```

After — 파라미터를 boolean에서 "어떤 draft를 선택할지"의 집합으로 바꾼다:

```ts
  // Before의 boolean 파라미터는 "전체"만 표현할 수 있어 예산 개념을 담지
  // 못한다. 대상 id 집합을 받아 전체 해제(빈 집합)와 예산만큼 채우기를
  // 같은 경로로 처리한다. 낙관적 갱신·재동기화 구조는 Before와 동일하다.
  const setSelectionMutation = useMutation({
    mutationFn: async (selectedIds: Set<string>) => {
      // Before와 동일하게 skip 최적화를 두지 않는다. onMutate가 캐시를 먼저
      // 뒤집으므로, 여기서 clipDrafts와 대조해 건너뛰면 리렌더 타이밍에 따라
      // 서버에 아무것도 저장되지 않을 수 있다.
      for (const draft of clipDrafts) {
        const result = await saveClipDraftEdit({
          clipDraftId: draft.id,
          startSeconds: draft.startSeconds,
          endSeconds: draft.endSeconds,
          selected: selectedIds.has(draft.id),
        });
        if (!result.success) {
          throw new Error(result.error);
        }
      }
    },
    onMutate: async (selectedIds) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<UploadedFileDetail>(detailKey);

      if (previous) {
        queryClient.setQueryData<UploadedFileDetail>(detailKey, {
          ...previous,
          clipDrafts: previous.clipDrafts.map((draft) => ({
            ...draft,
            selected: selectedIds.has(draft.id),
          })),
        });
      }

      return { previous };
    },
    // ⚠️ Phase 1b(§4.10)가 여기에 trackSelectionChanged()를 추가한다.
    //    Phase 1b를 먼저 적용했다면 이 줄을 `onSettled: invalidateDetail`로
    //    되돌리지 말 것 — 계측이 조용히 사라진다. 최종 형태는 §4.10이 규정한다.
    onSettled: invalidateDetail,
    onError: (error, _selectedIds, context) => {
      if (context?.previous) {
        queryClient.setQueryData(detailKey, context.previous);
      }
      toast.error(
        error instanceof Error ? error.message : "Failed to update selection",
      );
    },
  });
```

반환부 Before (`:249-250`, `:257`):

```ts
    selectAll: () => setAllSelectionMutation.mutateAsync(true),
    deselectAll: () => setAllSelectionMutation.mutateAsync(false),
```

```ts
    isSettingSelection: setAllSelectionMutation.isPending,
```

After:

```ts
    // clipDrafts는 Gemini 랭킹 순으로 정렬되어 온다
    // (index = moment.index ?? order, inngest/functions.ts:941/:950 →
    //  clip-draft/api/index.ts:37 orderBy index asc).
    // 따라서 slice(0, limit)은 "상위 N개"가 맞다. 시간순이 아니다.
    // 전체 선택은 draft가 항상 목표의 2배라 성립하지 않는다(main.py:983).
    selectUpToBudget: (limit: number) =>
      setSelectionMutation.mutateAsync(
        new Set(clipDrafts.slice(0, limit).map((draft) => draft.id)),
      ),
    deselectAll: () => setSelectionMutation.mutateAsync(new Set<string>()),
```

```ts
    // 뮤테이션 이름이 바뀌었으므로 이 줄도 함께 고쳐야 한다.
    // 놓치면 미정의 식별자로 빌드가 깨진다.
    isSettingSelection: setSelectionMutation.isPending,
```

> 불변식: `deselectAll()`은 Before와 동일하게 모든 draft를 `selected: false`로 저장해야 한다. 빈 집합은 `selectedIds.has(...)`가 항상 `false`이므로 동일하다. `mutationFn`이 대상 전체를 무조건 저장하는 성질(Before의 주석 `:196-200`이 명시한, skip 최적화 금지)도 유지된다.

#### 4.4 `src/fsd/widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx`

체크박스에 예산·겹침 상태를 반영한다.

Before (`:213-253`, 카드 루트와 헤더부):

```tsx
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        isActive && "ring-2 ring-primary",
        !draft.selected && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={draft.selected}
            onChange={(event) => handleSelectedChange(event.target.checked)}
          />
```

After:

```tsx
  // 예산이 찬 상태에서 아직 선택되지 않은 카드만 잠근다.
  // 이미 선택된 카드는 항상 해제 가능해야 교체가 된다.
  const isBlockedByBudget = isBudgetFull && !draft.selected;

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        isActive && "ring-2 ring-primary",
        !draft.selected && "opacity-70",
        isOverlapping && "border-destructive",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <label
          className={cn(
            "flex items-start gap-2",
            isBlockedByBudget && "cursor-not-allowed",
          )}
        >
          <input
            type="checkbox"
            className="mt-1"
            checked={draft.selected}
            disabled={isBlockedByBudget}
            aria-describedby={
              isBlockedByBudget ? `${draft.id}-budget-hint` : undefined
            }
            onChange={(event) => handleSelectedChange(event.target.checked)}
          />
```

겹침·예산 안내를 길이 안내 옆에 둔다. Before (`:333-342`):

```tsx
      <p
        className={cn(
          "mt-2 text-xs",
          withinLimits ? "text-muted-foreground" : "text-destructive",
        )}
      >
        Length: {duration.toFixed(1)}s
        {!withinLimits &&
          ` — not saved (must be ${CLIP_DURATION_LIMITS.MIN_SECONDS}-${CLIP_DURATION_LIMITS.MAX_SECONDS}s)`}
      </p>
```

After:

```tsx
      <p
        className={cn(
          "mt-2 text-xs",
          withinLimits ? "text-muted-foreground" : "text-destructive",
        )}
      >
        Length: {duration.toFixed(1)}s
        {!withinLimits &&
          ` — not saved (must be ${CLIP_DURATION_LIMITS.MIN_SECONDS}-${CLIP_DURATION_LIMITS.MAX_SECONDS}s)`}
      </p>

      {isOverlapping && (
        <p className="text-destructive mt-1 text-xs">
          Overlaps another selected clip. Adjust the start or end.
        </p>
      )}

      {isBlockedByBudget && (
        <p
          id={`${draft.id}-budget-hint`}
          className="text-muted-foreground mt-1 text-xs"
        >
          Swap one out to pick this instead.
        </p>
      )}
```

props 추가 — 인터페이스와 **구조 분해 둘 다** 고쳐야 한다. 인터페이스만 고치면 위 본문의 `isOverlapping`/`isBudgetFull`이 스코프에 없어 빌드가 깨진다.

인터페이스 Before (`:28-37`의 `ClipDraftCardProps` 끝부분):

```tsx
  onApplyToAll: (style: CaptionStyle) => void;
  isApplyingToAll: boolean;
}
```

After:

```tsx
  onApplyToAll: (style: CaptionStyle) => void;
  isApplyingToAll: boolean;
  isOverlapping: boolean;
  isBudgetFull: boolean;
}
```

구조 분해 Before (`:69-78`):

```tsx
export default function ClipDraftCard({
  draft,
  isActive,
  language,
  transcriptWords,
  onPreview,
  onSave,
  onApplyToAll,
  isApplyingToAll,
}: ClipDraftCardProps) {
```

After:

```tsx
export default function ClipDraftCard({
  draft,
  isActive,
  language,
  transcriptWords,
  onPreview,
  onSave,
  onApplyToAll,
  isApplyingToAll,
  isOverlapping,
  isBudgetFull,
}: ClipDraftCardProps) {
```

#### 4.5 `src/fsd/widgets/clip-draft-review/ui/_component/AddCustomClipPanel.tsx`

단어 선택을 키보드로 가능하게 한다. Before (`:109-127`):

```tsx
            {transcriptWords.map((word, idx) => {
              const inRange =
                selectedLo !== null &&
                selectedHi !== null &&
                idx >= selectedLo &&
                idx <= selectedHi;
              return (
                <span
                  key={`${idx}-${word.start}`}
                  onClick={() => handleWordClick(idx)}
                  className={cn(
                    "cursor-pointer rounded px-0.5",
                    inRange && "bg-primary/20",
                  )}
                >
                  {word.word}{" "}
                </span>
              );
            })}
```

After:

```tsx
            {transcriptWords.map((word, idx) => {
              const inRange =
                selectedLo !== null &&
                selectedHi !== null &&
                idx >= selectedLo &&
                idx <= selectedHi;
              return (
                <button
                  key={`${idx}-${word.start}`}
                  type="button"
                  aria-pressed={inRange}
                  onClick={() => handleWordClick(idx)}
                  className={cn(
                    "cursor-pointer rounded px-0.5",
                    inRange && "bg-primary/20",
                  )}
                >
                  {word.word}{" "}
                </button>
              );
            })}
```

> 불변식: 클릭 동작(`handleWordClick(idx)`)과 선택 하이라이트 조건은 Before와 동일하다. `<span>`을 `<button type="button">`으로 바꾸면 Tab 도달과 Enter/Space 활성화가 브라우저 기본 동작으로 붙는다 — `onKeyDown` 수동 구현이 필요 없다. `type="button"`은 이 패널이 form 안에 놓일 경우의 의도치 않은 제출을 막는다.

전사가 없을 때 패널이 통째로 사라지는 동작(`:80-82`)은 선행 문서(`custom-clip-segments-2026-07-20.md`)의 결정이므로 이번 범위에서 바꾸지 않는다.

#### 4.6 `src/fsd/widgets/clip-draft-review/ui/_component/CaptionStyleEditor.tsx`

Before (`:219-221`):

```tsx
        <p className="text-center text-[11px] text-muted-foreground">
          Preview is approximate — final render may differ.
        </p>
```

After:

```tsx
        <p className="text-center text-[11px] text-muted-foreground">
          Caption size, color and position are accurate. The background is not —
          the final clip is cropped to vertical and follows whoever is speaking.
        </p>
```

> 근거: 캡션 좌표는 백엔드와 동일한 PlayResY 1920 기준으로 환산된다(`:71-76`). 배경만 실제와 다르다. "may differ"는 무엇이 다른지 말하지 않아 사용자가 캡션까지 의심하게 만든다.

#### 4.7 계측 — `src/fsd/shared/analytics/event-catalog.ts`

Before (`:16-19`):

```ts
  "processing_scheduled",
  "processing_schedule_failed",
  "upload_detail_viewed",
  "clip_viewed",
```

After:

```ts
  "processing_scheduled",
  "processing_schedule_failed",
  "upload_detail_viewed",
  "clip_review_opened",
  "clip_review_selection_changed",
  "clip_review_custom_clip_added",
  "clip_review_generate_blocked",
  "clip_review_confirmed",
  "clip_viewed",
```

#### 4.8 계측 — `src/fsd/shared/analytics/lib/metadata.ts`

Before (`:20-21`):

```ts
  upload_detail_viewed: ["uploadedFileId", "status", "visibleClipsCount"],
  clip_viewed: ["clipId", "uploadedFileId"],
```

After:

```ts
  upload_detail_viewed: ["uploadedFileId", "status", "visibleClipsCount"],
  clip_review_opened: [
    "uploadedFileId",
    "draftCount",
    "budgetLimit",
    "credits",
  ],
  clip_review_selection_changed: ["uploadedFileId", "selectedCount", "isFull"],
  clip_review_custom_clip_added: ["uploadedFileId"],
  // reason은 getGenerateBlockReason의 kind와 동일한 값이다.
  // 이 이벤트가 "어디서 막히는가"에 직접 답한다.
  clip_review_generate_blocked: ["uploadedFileId", "reason", "selectedCount"],
  clip_review_confirmed: ["uploadedFileId", "selectedCount", "budgetLimit"],
  clip_viewed: ["clipId", "uploadedFileId"],
```

#### 4.9 퍼널 — 별도 `review` 퍼널 신설 (activation은 건드리지 않는다)

⚠️ **`activation` 퍼널에 검토 두 단계를 끼워 넣으면 안 된다.** 두 가지가 겹쳐 기존 지표를 조용히 망가뜨린다:

1. **검토는 선택 기능이고 기본값은 꺼짐이다.** `reviewBeforeGenerate Boolean @default(false)`(`prisma/schema.prisma:81`)이고, 업로드 폼의 "Review first / Auto" 토글(`pages/dashboard/ui/_component/UploadPodcast.tsx:205`)이 이를 정한다. 꺼져 있으면 `"auto"`로 디스패치되어(`features/upload/api/index.ts:170`) `review_pending`을 아예 거치지 않는다.
2. **퍼널 매처가 엄격한 순차 방식이다.** `buildFunnelReportFromEvents`(`entities/analytics-event/model/reporting.ts:80-103`)는 방문자의 이벤트를 시간순으로 훑으며 **현재 기대 스텝과 이름이 같을 때만** 다음으로 넘어간다(`:92`).

둘을 합치면: auto 모드 사용자는 `processing_scheduled` 다음에 `clip_review_opened`가 없으므로 매처가 거기서 멈추고, **그들의 `clip_viewed`가 영영 집계되지 않는다.** 즉 activation 퍼널의 마지막 칸이 "검토를 켠 소수"만 남아 붕괴한다. 과거 데이터뿐 아니라 **앞으로도 영구히** 그렇다.

그래서 activation은 그대로 두고 검토 전용 퍼널을 만든다. 관리자 화면의 퍼널 선택 버튼은 `Object.keys(FUNNEL_LABELS)`에서 자동 생성되므로(`pages/admin-analytics/ui/index.tsx:118`) UI 변경은 불필요하다.

**(a) `src/fsd/entities/analytics-event/model/types.ts`**

Before (`:4`):

```ts
export type FunnelId = "acquisition" | "activation" | "billing";
```

After:

```ts
export type FunnelId = "acquisition" | "activation" | "billing" | "review";
```

**(b) `src/fsd/entities/analytics-event/model/funnels.ts`** — `activation`(`:12-19`)은 **변경하지 않는다.** `billing` 아래에 한 항목을 추가한다.

Before (`:20-32`):

```ts
  billing: [
    "billing_viewed",
    "billing_cta_clicked",
    "checkout_started",
    "checkout_returned_success",
  ],
} as const satisfies Record<FunnelId, readonly AnalyticsEventName[]>;

export const FUNNEL_LABELS = {
  acquisition: "Acquisition",
  activation: "Upload Activation",
  billing: "Billing",
} as const satisfies Record<FunnelId, string>;
```

After:

```ts
  billing: [
    "billing_viewed",
    "billing_cta_clicked",
    "checkout_started",
    "checkout_returned_success",
  ],
  // "Review first"로 업로드한 경우에만 밟는 경로다. activation에 섞으면
  // auto 모드 사용자가 첫 스텝에서 걸려 뒤가 전부 0이 된다(위 설명).
  review: [
    "clip_review_opened",
    "clip_review_confirmed",
    "clip_viewed",
  ],
} as const satisfies Record<FunnelId, readonly AnalyticsEventName[]>;

export const FUNNEL_LABELS = {
  acquisition: "Acquisition",
  activation: "Upload Activation",
  billing: "Billing",
  review: "Clip Review",
} as const satisfies Record<FunnelId, string>;
```

> `satisfies Record<FunnelId, ...>`가 두 객체 모두에 걸려 있어, `FunnelId`만 넓히고 여기를 빠뜨리면 `tsc`가 잡는다.

**(c) `src/app/admin/analytics/page.tsx`** — 이곳만 타입이 강제하지 않는다. `Set<FunnelId>` 리터럴이라 빠뜨려도 컴파일은 통과하고, `?funnel=review` 쿼리가 조용히 `activation`으로 폴백한다(`parseFunnel`, `:43-47`). **반드시 함께 고칠 것.**

Before (`:16-20`):

```tsx
const VALID_FUNNELS = new Set<FunnelId>([
  "acquisition",
  "activation",
  "billing",
]);
```

After:

```tsx
const VALID_FUNNELS = new Set<FunnelId>([
  "acquisition",
  "activation",
  "billing",
  "review",
]);
```

#### 4.10 계측 발화 지점 — 이벤트를 그 전이가 일어나는 곳에 둔다

> **적용 시점이 둘로 갈린다** (§5 Phase 1a / 1b):
>
> | 이벤트 | 의존 심볼 | 적용 |
> |---|---|---|
> | `clip_review_opened` | 없음 (`targetClipCount` prop만) | **Phase 1a** |
> | `clip_review_confirmed` | 없음 (`budgetContext`) | **Phase 1a** |
> | `clip_review_custom_clip_added` | 없음 | **Phase 1a** |
> | `clip_review_selection_changed` | `setSelectionMutation` (§4.3) | **Phase 1b** |
> | `clip_review_generate_blocked` | `generateBlockReason.kind`, `BlockKind` (§4.2) | **Phase 1b** |
>
> 아래 코드는 **최종 형태**다. Phase 1a에서는 위 표의 3종만 적용하고, `clip_review_opened`의 `budgetLimit`에는 `budget.limit` 대신 prop `targetClipCount`를 넣는다.
>
> ⚠️ **Phase 1a의 호출부 중간 상태.** 이 절이 훅 시그니처를 3인자로 바꾸므로 호출부도 같이 고쳐야 하는데, §4.2의 호출부 After는 `selectUpToBudget` 이름 변경(§4.3, Phase 2)까지 함께 담고 있어 Phase 1a에 그대로 쓸 수 없다. Phase 1a에서는 **인자만** 추가한다:
>
> ```tsx
> // Phase 1a: 구조 분해는 그대로(selectAll 유지), 세 번째 인자만 추가
>   } = useClipDraftReview(uploadedFileId, clipDrafts, { targetClipCount });
> ```
>
> Phase 2에서 §4.2의 After를 적용하면 `selectAll` → `selectUpToBudget`까지 최종 형태가 된다. 이 중간 단계를 건너뛰면 Phase 1a가 `TS2554: Expected 3 arguments, but got 2`로 빌드에 실패한다 — Phase 1a의 검증 항목인 `npm run check`가 바로 잡는다.

⚠️ 카탈로그(§4.7)·허용 키(§4.8)·퍼널(§4.9)만 추가하고 발화를 적지 않으면 **아무 일도 일어나지 않는다.** `sanitizeAnalyticsMetadata`(`shared/analytics/lib/metadata.ts:41-69`)는 허용 목록에 없는 키를 조용히 버리고 빠진 키도 조용히 넘기므로, 키 이름을 틀려도 컴파일 오류도 런타임 오류도 없이 그 값만 영영 비어 있게 된다. 퍼널 두 칸도 발화가 없으면 영구히 0으로 표시된다.

**소유권 원칙**: 이벤트는 그것이 기록하는 전이가 일어나는 곳에서 쏜다. 세 이벤트(`confirmed`/`custom_clip_added`/`selection_changed`)는 훅의 뮤테이션 성공이 곧 전이이므로 훅에서 쏘고, 나머지 둘은 위젯의 렌더 상태에서 파생되므로 위젯에서 쏜다. 이를 위해 훅이 예산 산정에 필요한 두 값을 받는다 — 지금 시그니처(`useClipDraftReview(uploadedFileId, clipDrafts)`, `:40-43`)는 받지 않는다.

**훅 시그니처** Before (`:40-43`):

```ts
export function useClipDraftReview(
  uploadedFileId: string,
  clipDrafts: ClipDraft[],
) {
```

After:

```ts
export function useClipDraftReview(
  uploadedFileId: string,
  clipDrafts: ClipDraft[],
  // 계측 메타데이터 산정용. 훅의 뮤테이션 성공 지점에서 예산 값을 함께
  // 실어 보내기 위해 받는다. 선택 동작 자체는 이 값에 의존하지 않는다.
  budgetContext: { targetClipCount: number },
) {
```

**훅에서 쏘는 3종** — 기존 `onSuccess`에 한 줄씩 추가한다. Before는 `:161-163`(confirm), `:179-181`(addCustom), 그리고 `setSelectionMutation`의 `onSettled`.

```ts
// confirmMutation.onSuccess (Before :161-163)
    onSuccess: async () => {
      await invalidateDetail();
      void trackAnalyticsEvent(
        "clip_review_confirmed",
        {
          uploadedFileId,
          selectedCount: clipDrafts.filter((draft) => draft.selected).length,
          budgetLimit: budgetContext.targetClipCount,
        },
        { path: ANALYTICS_PATH },
      );
      toast.success("Clip generation started");
    },
```

```ts
// addCustomMutation.onSuccess (Before :179-181)
    onSuccess: async () => {
      await invalidateDetail();
      void trackAnalyticsEvent(
        "clip_review_custom_clip_added",
        { uploadedFileId },
        { path: ANALYTICS_PATH },
      );
      toast.success("Custom clip added");
    },
```

선택 변경은 **두 경로**로 일어나므로 두 곳 모두에서 쏜다. `saveMutation` 하나에만 붙이면 안 된다:

- 카드 체크박스는 `saveMutation`을 거치지만(`ClipDraftCard.tsx:189-198` → `runSave` → `onSave`), **같은 뮤테이션이 구간·캡션 자동 저장에도 쓰인다**(`ClipDraftCard.tsx:153-183`의 디바운스 이펙트). 무조건 쏘면 구간을 만질 때마다 "선택 변경"이 기록된다.
- `Fill N slots` / `Clear selection`은 `setSelectionMutation`이 `saveClipDraftEdit`를 **직접** 호출하므로(`use-clip-draft-review.ts:194-238`) `saveMutation`을 거치지 않는다. 여기만 보면 일괄 변경이 통째로 누락된다.

```ts
// saveMutation — onMutate가 이미 읽는 previous 캐시로 "선택이 실제로 바뀌었는지"를
// 판정해 context로 넘긴다. 구간·캡션만 바뀐 저장은 쏘지 않는다.
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<UploadedFileDetail>(detailKey);
      const previousDraft = previous?.clipDrafts.find(
        (draft) => draft.id === input.clipDraftId,
      );
      const selectionChanged =
        previousDraft !== undefined && previousDraft.selected !== input.selected;

      // ... (기존 낙관적 갱신 본문은 그대로)

      return { previous, selectionChanged };
    },
    onSettled: async (_data, _error, _input, context) => {
      await invalidateDetail();
      if (!context?.selectionChanged) return;
      trackSelectionChanged();
    },
```

```ts
// setSelectionMutation — Fill/Clear. 대상 전체를 다시 쓰므로 항상 선택 변경이다.
    onSettled: async () => {
      await invalidateDetail();
      trackSelectionChanged();
    },
```

두 곳이 같은 페이로드를 쓰도록 훅 안에 한 번만 정의한다:

```ts
  // invalidate 직후라 clipDrafts prop이 아직 이전 값일 수 있다(Open Questions).
  // 추세 파악 목적에는 충분하다고 보고 1차에서는 이 단순한 형태를 쓴다.
  const trackSelectionChanged = () => {
    const selectedCount = clipDrafts.filter((draft) => draft.selected).length;
    void trackAnalyticsEvent(
      "clip_review_selection_changed",
      {
        uploadedFileId,
        selectedCount,
        isFull: selectedCount >= budgetContext.targetClipCount,
      },
      { path: ANALYTICS_PATH },
    );
  };
```

> `dedupeKey`를 쓰지 않는 건 의도적이다 — 선택 변경 횟수 자체가 지표이고, `dedupeKey`는 아래 설명대로 **페이지 세션 동안 영구 1회**라 횟수를 셀 수 없다.

**위젯에서 쏘는 2종** (`ui/index.tsx`):

```tsx
// 검토 화면 진입 1회. upload_detail_viewed(pages/upload-detail/ui/index.tsx:49-67)와
// 동일하게 ref로 중복 발화를 막는다.
const trackedOpenRef = useRef(false);

useEffect(() => {
  if (trackedOpenRef.current) return;
  trackedOpenRef.current = true;

  void trackAnalyticsEvent(
    "clip_review_opened",
    {
      uploadedFileId,
      draftCount: clipDrafts.length,
      budgetLimit: budget.limit,
      credits: currentUserCredits,
    },
    {
      path: ANALYTICS_PATH,
      dedupeKey: `clip_review_opened:${uploadedFileId}`,
    },
  );
}, [uploadedFileId, clipDrafts.length, budget.limit, currentUserCredits]);

// 사유별로 "이 사용자가 이 벽에 부딪혔는가"를 1회 기록한다.
//
// ⚠️ dedupeKey의 수명을 정확히 알고 쓸 것: sentDedupeKeys는 모듈 스코프 Set이고
//    비워지지 않는다(shared/analytics/lib/track-event.ts:15,34-40). 즉 같은 키는
//    **페이지 세션 동안 영구히 1회**만 나간다 — 사유가 해소됐다가 다시 걸려도
//    재발화하지 않는다. 여기서는 그게 의도다(도달 여부가 지표, 횟수가 아님).
//    횟수를 세려면 dedupeKey를 빼야 하는데, 그러면 리렌더마다 나간다.
useEffect(() => {
  if (!generateBlockReason) return;

  void trackAnalyticsEvent(
    "clip_review_generate_blocked",
    {
      uploadedFileId,
      reason: generateBlockReason.kind,
      selectedCount: budget.selectedCount,
    },
    {
      path: ANALYTICS_PATH,
      dedupeKey: `clip_review_generate_blocked:${uploadedFileId}:${generateBlockReason.kind}`,
    },
  );
  // generateBlockReason 객체는 매 렌더 새로 생성되므로 객체가 아니라 kind에
  // 의존한다. selectedCount는 페이로드에 실리므로 함께 둔다 — 이 값 때문에
  // 이펙트가 자주 재실행되지만, 실제 전송은 dedupeKey가 1회로 막는다.
}, [uploadedFileId, generateBlockReason?.kind, budget.selectedCount]);
```

경로 상수는 기존 호출부와 동일한 형태로 파일 상단에 둔다:

```tsx
const ANALYTICS_PATH = "/dashboard/uploads/[uploadedFileId]";
```

> `reason`은 §4.2에서 export한 `BlockKind`의 값을 그대로 싣는다. 허용 키 주석(§4.8)이 아니라 `generateBlockReason.kind`를 직접 넘기므로, `BlockKind`에서 값을 지우면 이 호출부가 함께 깨진다. 새 사유를 추가할 때 계측 쪽을 잊는 경로만 남는데, 그건 §4.8 주석이 안내한다.
>
> ⚠️ 위 세 훅 이벤트는 `clipDrafts` prop을 읽어 `selectedCount`를 센다. `onSuccess`/`onSettled` 시점의 `clipDrafts`는 **invalidate 직후라 아직 이전 값일 수 있다.** 정확한 카운트가 중요하면 뮤테이션 인자에서 파생시켜야 한다 — Open Questions에 남긴다.

---

## 5. 실행 순서

> ⚠️ **계측은 두 조각으로 나뉜다.** 이벤트 5종 중 2종(`clip_review_selection_changed`, `clip_review_generate_blocked`)은 Phase 2·3이 만드는 심볼(`setSelectionMutation`, `budget`, `BlockKind`, 재구성된 `generateBlockReason`)에 의존하므로 **Phase 1에 넣을 수 없다.** 나머지 3종은 현재 코드만으로 구현 가능하다. 이 분할을 무시하고 §4.10을 통째로 Phase 1에 넣으면 미정의 심볼로 빌드가 깨진다.

### Phase 1a: 의존성 없는 계측 (§4.7~4.9, §4.10 중 3종)

- 작업 내용: 이벤트 5종 이름 + 메타데이터 키 전부 추가(카탈로그는 미리 채워도 무해하다), **신규 `review` 퍼널 4개 표면**(§4.9 a/b/c + activation 무변경), 그리고 **현재 코드만으로 되는 발화 3종** — `clip_review_opened`(위젯), `clip_review_confirmed`·`clip_review_custom_clip_added`(훅 `onSuccess`) + 훅 시그니처에 `budgetContext` 추가.
  - `clip_review_opened`의 `budgetLimit`은 `budget.limit`이 아직 없으므로 **prop인 `targetClipCount`를 직접** 쓴다(Phase 2 이후 `budget.limit`으로 바꿔도 값은 같다).
  - 훅 호출부는 **인자만 추가**한다(`selectAll` 구조 분해는 Phase 2까지 유지). §4.2의 호출부 After는 이름 변경까지 포함한 최종 형태이므로 여기서 그대로 쓰면 안 된다 — §4.10 상단의 "Phase 1a 호출부 중간 상태" 참조.
- 검증: `npm run check` 통과. **"Review first"를 켜고** 업로드해 검토 화면 진입 → 커스텀 클립 추가 → 확정. `/admin/analytics`에서 **`Clip Review` 버튼이 보이고** `opened`/`confirmed` 두 칸이 집계되는지, **`Upload Activation` 수치는 그대로인지** 확인.
- 왜 먼저인가: 이후 Phase의 before/after 기준선을 만들고, 이 3종은 다른 Phase에 의존하지 않는다. **데이터를 기다리는 게이트가 아니다** — 즉시 배포하고 Phase 2로 넘어간다.

### Phase 1b: 나머지 계측 2종 (§4.10) — **Phase 3 이후**

- 작업 내용: `clip_review_selection_changed`(`saveMutation` 선택 변화 판정 + `setSelectionMutation`), `clip_review_generate_blocked`(`generateBlockReason.kind`). §4.3의 `onSettled` 주석대로 계측 호출을 유지할 것.
- 검증: 체크박스 토글 → 이벤트 1건. **구간만 수정 → 이벤트 없음**(오발화 검증). `Fill`/`Clear` → 각 1건. 크레딧 부족·겹침 상태를 각각 만들어 `reason`이 다르게 기록되는지 확인.
- 왜 나중인가: 두 이벤트가 참조하는 심볼이 Phase 2·3의 산출물이다. 순서를 당기면 빌드가 깨진다.

### Phase 2: 선택 예산 (§4.1~4.4)

- 작업 내용: `selection-budget.ts` 신규, 훅 파라미터 전환, 헤더 예산 표시, `Fill N slots`/`Clear selection` 교체, 예산 도달 시 미선택 체크박스 비활성화.
- 검증: 목표 3인 업로드에서 3개 선택 후 나머지 체크박스가 잠기고, 하나 해제 시 다시 열린다. `Fill 3 slots`가 3개만 선택한다. 새로고침 후 유지된다. §8의 단위 테스트 통과.

### Phase 3: 겹침 시각화 (§4.1, 4.2, 4.4)

- 작업 내용: `getOverlappingDraftIds` 사용, 카드 테두리·문구, 헤더 차단 문구에 개수 표기.
- 검증: 두 선택 클립을 겹치게 조정하면 양쪽 카드에 표시가 뜨고 헤더 문구에 개수가 반영된다. 해소하면 사라지고 Generate가 활성화된다.

### Phase 4: 막다른 길 + 문구 (§4.2 빌링 링크, §4.6)

- 작업 내용: 크레딧 차단 시 `/dashboard/billing` 링크, 캡션 프리뷰 문구 교체.
- 검증: 크레딧보다 많이 선택한 상태에서 링크가 보이고 이동한다. 프리뷰 문구가 바뀐다.

### Phase 5: 키보드 접근성 (§4.5)

- 작업 내용: 커스텀 클립 단어를 `<button>`으로 전환.
- 검증: 마우스 없이 Tab으로 단어에 도달하고 Enter/Space로 시작·끝 단어를 선택해 클립을 추가할 수 있다.

---

## 6. 영향 범위

- **직접 수정 대상**: `widgets/clip-draft-review/` 4개 파일(`ui/index.tsx`, `ui/_component/ClipDraftCard.tsx`, `ui/_component/AddCustomClipPanel.tsx`, `ui/_component/CaptionStyleEditor.tsx`) + `model/use-clip-draft-review.ts`, 신규 `model/selection-budget.ts`, `shared/analytics/event-catalog.ts`, `shared/analytics/lib/metadata.ts`, `entities/analytics-event/model/funnels.ts`, `entities/analytics-event/model/types.ts`, `app/admin/analytics/page.tsx`. 총 11개 파일(신규 2 포함).
- **import 변경 필요**: `ui/index.tsx`에 `next/link`, `selection-budget`, `~/fsd/shared/analytics`의 `trackAnalyticsEvent` 추가. `use-clip-draft-review.ts`에도 `trackAnalyticsEvent` 추가. `ClipDraftCard`는 props 2개 추가(호출부 `ui/index.tsx:240-251`가 유일).
- **훅 시그니처 변경**: `useClipDraftReview`가 세 번째 인자 `budgetContext`를 받는다(§4.10). 호출부는 `ui/index.tsx:73-86` 한 곳뿐이라 파급이 닫혀 있고, 갱신된 호출은 §4.2에 Before/After로 표시했다 — 인자를 빠뜨리면 `TS2554`로 즉시 드러난다.
- **외부 의존성**: 없음. 새 패키지 없음. 서버 액션·Prisma 스키마·백엔드 무변경.
- **소비자/사용처 영향**: `ClipDraftReviewSection`의 사용처를 역방향 검색(`grep -rn "ClipDraftReviewSection\|clip-draft-review"`)으로 확인한 결과 `src/fsd/pages/upload-detail/ui/index.tsx:18,97`이 유일하며 props 시그니처는 바뀌지 않는다. 다만 이 검색은 정적 import 기준이라 문자열 키 기반 동적 참조는 열거하지 않았다 (Open Questions). 퍼널 변경은 **추가**뿐이라 `activation`·`acquisition`·`billing`의 수치는 그대로다. 새 `review` 퍼널은 과거 데이터에 해당 이벤트가 없어 **배포 이전 구간이 0으로 표시된다** — 이벤트 보존 기간이 90일(`entities/analytics-event/api/index.ts:121-122`)이므로 배포 후 90일이 지나면 이 구간은 자연히 사라진다. 관리자 화면의 퍼널 선택 버튼은 `FUNNEL_LABELS`에서 자동 생성되므로(`pages/admin-analytics/ui/index.tsx:118`) UI 코드 변경은 없다.

---

## 7. 리스크 + 롤백 전략

### 리스크

| 리스크 | 가능성 | 영향 | 완화 |
|---|---|---|---|
| 비활성 체크박스의 이유가 전달되지 않아 "고장난 것"으로 오인 | 중 | 중 | 헤더 남은 슬롯 표시 + 카드별 안내 문구(`§4.4`)를 함께 넣는다. 둘 중 하나만 넣지 않는다 |
| 낙관적 갱신 도중 예산 계산이 과도 상태를 보아 체크박스가 깜빡임 | 중 | 하 | 예산은 detail 캐시(`draft.selected`)에서 파생되므로 낙관적 갱신과 같은 시점에 갱신된다. 카드 로컬 state로 복사하지 않는다(선행 라운드가 `ClipDraftCard.tsx:79-81`에 남긴 경고와 동일한 이유) |
| `review` 퍼널을 activation에 합치고 싶은 유혹 | 중 | **높** | 합치면 auto 모드(기본값) 사용자가 첫 검토 스텝에서 걸려 그 뒤 `clip_viewed`가 영구히 0이 된다 — 매처가 엄격 순차이기 때문(`reporting.ts:92`). §4.9의 경고를 지우지 말 것 |
| `VALID_FUNNELS`(§4.9-c)를 빠뜨림 | 중 | 중 | 타입이 강제하지 않는 유일한 지점이다. 빠뜨리면 `?funnel=review`가 조용히 activation으로 폴백해 새 퍼널을 볼 수 없다. Phase 1a 검증에서 버튼 클릭으로 확인 |
| `Fill N slots`가 초기 상태에서는 거의 쓸 일이 없음 | 높 | 하 | 화면이 이미 예산 가득으로 열리므로 이 버튼은 `Clear selection` 이후에만 활성화된다. 의도된 동작이며, 순서 규칙("상위 N개")은 랭킹 순 정렬로 확인 완료(§4.3) |
| `<span>` → `<button>` 전환으로 인라인 텍스트 흐름이 깨짐 | 중 | 하 | 브라우저 기본 버튼 스타일이 적용되므로 `display`/`font` 상속을 명시적으로 맞춰야 한다. Phase 5 단독 배포라 시각 회귀를 격리 확인할 수 있다 |

### 롤백 전략

Phase 단위로 독립 되돌리기가 가능하다. 스키마·서버 액션 변경이 없어 DB 정리가 불필요하다.

- Phase 2~5: 해당 커밋 revert. 서버 가드가 그대로 있으므로 UI 제한이 사라져도 무효 상태는 서버가 막는다.
- Phase 1a·1b(계측): 전부 additive다 — 기존 퍼널 3종을 건드리지 않으므로 되돌릴 것도 없다. `review` 퍼널만 숨기려면 `FUNNEL_LABELS`·`ANALYTICS_FUNNELS`·`FunnelId`·`VALID_FUNNELS`에서 함께 제거하면 되고(넷 중 셋은 타입이 강제한다), 기록된 이벤트 행은 남겨도 무해하다.

---

## 8. 검증 전략

- **기존 테스트**: `src/fsd/shared/analytics/lib/metadata.test.mjs`가 메타데이터 정제를 검증한다. §4.8의 키 추가가 이 테스트를 깨지 않는지 확인한다.
- **추가 테스트**: `src/fsd/widgets/clip-draft-review/model/selection-budget.test.mjs` — 형제 테스트(`src/fsd/entities/analytics-event/model/reporting.test.mjs:1-8`)의 `node:test` + `node:assert/strict` + `.ts` 직접 import 패턴을 그대로 따른다.

  **실행 명령** (이 저장소에서 실제로 확인함, Node v22.13.1):

  ```bash
  node --experimental-strip-types --test src/fsd/widgets/clip-draft-review/model/selection-budget.test.mjs
  ```

  ⚠️ **플래그가 없으면 실패한다.** `.mjs`가 `.ts`를 직접 import하므로 타입 스트리핑이 필요하고, 없으면 `ERR_UNKNOWN_FILE_EXTENSION: Unknown file extension ".ts"`로 죽는다. 형제 테스트(`reporting.test.mjs`)도 동일하며, 플래그를 붙이면 3 pass로 통과하는 것을 확인했다. `package.json`에 이 명령을 담은 스크립트가 없으므로(`:6-20`) 수동 실행이다.

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getSelectionBudget, getOverlappingDraftIds } from "./selection-budget.ts";

function draft(overrides) {
  return {
    id: "draft-1",
    selected: false,
    startSeconds: 0,
    endSeconds: 40,
    ...overrides,
  };
}

describe("selection budget", () => {
  it("leaves the full limit remaining when nothing is selected", () => {
    const budget = getSelectionBudget({
      clipDrafts: [],
      targetClipCount: 3,
    });

    // 빈 입력 — 계산 없이 확인 가능한 값.
    assert.equal(budget.selectedCount, 0);
    assert.equal(budget.remaining, budget.limit);
    assert.equal(budget.isFull, false);
  });

  it("is full exactly when the seeded selection equals the target", () => {
    // 실제 초기 상태를 재현한다: 목표 3, draft 6개, 상위 3개 선택
    // (inngest/functions.ts:950의 `selected: order < clipCount`).
    const clipDrafts = [0, 1, 2, 3, 4, 5].map((i) =>
      draft({ id: `d${i}`, selected: i < 3 }),
    );
    const budget = getSelectionBudget({ clipDrafts, targetClipCount: 3 });

    assert.equal(budget.isFull, true);
    assert.equal(budget.remaining, 0);
  });

  it("never goes negative and keeps isFull consistent with remaining", () => {
    const budget = getSelectionBudget({
      clipDrafts: [
        draft({ id: "a", selected: true }),
        draft({ id: "b", selected: true }),
      ],
      targetClipCount: 1,
    });

    // 계약 불변식 — SelectionBudget 시그니처와 Math.max 가드에서 도출.
    // 선택이 상한을 넘는 과도 상태(낙관적 갱신 중)에서도 remaining은 음수가 아니다.
    assert.ok(budget.remaining >= 0);
    assert.equal(budget.isFull, budget.remaining === 0);
    assert.equal(budget.limit, 1);
  });

  it("flags both sides of an overlapping pair", () => {
    const ids = getOverlappingDraftIds([
      draft({ id: "a", startSeconds: 0, endSeconds: 40 }),
      draft({ id: "b", startSeconds: 30, endSeconds: 70 }),
      draft({ id: "c", startSeconds: 80, endSeconds: 120 }),
    ]);

    assert.ok(ids.has("a"));
    assert.ok(ids.has("b"));
    assert.equal(ids.has("c"), false);
  });
});
```

- **타입/빌드 검증**: `npm run check` (`next lint && tsc --noEmit`, `package.json:12`). `eslint.config.js`가 `recommendedTypeChecked`를 켜 두어 타입 오류가 실패 게이트다.
- **수동 확인**: §2 성공 기준의 각 항목을 목표 개수 3(기본값) 업로드에서 순서대로 확인한다. 특히 다음 세 경로를 함께 본다 — (1) 첫 렌더가 이미 예산 가득인 상태에서 해제 → 재선택 왕복, (2) 크레딧이 목표보다 적은 계정에서 첫 렌더부터 `credits` 사유와 빌링 링크가 보이는지, (3) **크레딧 0인 계정에서 체크박스가 잠기지 않고** 빌링 링크에 도달 가능한지.

---

<!-- doc-validation-skip -->
## Open Questions

- **[4.10]** 훅의 `onSuccess`/`onSettled`에서 `clipDrafts.filter(...).length`로 `selectedCount`를 세는데, 그 시점의 `clipDrafts` prop이 invalidate 직후라 **이전 값일 수 있다.** 계측 수치가 한 스텝 뒤처질 가능성이 있다. 정확도가 중요하면 뮤테이션 인자(`selectedIds`, `SaveDraftInput.selected`)에서 파생시켜야 한다. 추세 파악 목적에는 충분하다고 보고 1차에서는 단순한 쪽을 택했다.
- **[6. 영향 범위]** 소비자 영향은 정적 import 기준 역방향 검색 1회로 산정했다. 문자열 키 라우트·DI·이벤트 버스를 통한 동적 참조는 열거하지 않았다.
- **[8. 검증 전략]** `package.json`에 테스트 실행 스크립트가 없다(`:6-20` 확인). 실행 명령 자체는 확인했으나(§8 참조) **CI에 연결되어 있지 않다** — 즉 `npm run check`만 실제 게이트이고, 단위 테스트는 수동으로 돌려야 한다. 스크립트를 추가할지는 이 문서 범위 밖이다.
- **[1. 배경/동기 / 2. 목표 상태]** 실제 화면을 렌더해 확인하지 못했다. `prisma/`에 seed 스크립트가 없어 `review_pending` + clip draft 상태에 도달하려면 전체 파이프라인 실행이나 수동 데이터 삽입이 필요하다. 카드 밀도·모바일 레이아웃에 대한 판단은 이번 문서에서 의도적으로 제외했다.
- ~~**[1. 배경/동기 (0)]** "Review first"를 켜는 비율이 얼마인지 모른다.~~ — **해소됨(2026-07-29, `a24d310`).** 아래는 당시 기록. `reviewBeforeGenerate`는 업로드 시점에 정해지는데 그 선택 자체가 계측되지 않는다 — 기존 `upload_options_changed`/`upload_started`의 허용 키는 `["fileType","fileSizeMb","language","clipCount"]`뿐이라(`shared/analytics/lib/metadata.ts:10-12`) 이 플래그가 실려 있지 않다. **이 비율을 모르면 검토 UX 개선의 도달 범위 자체를 알 수 없다.** 허용 키에 `reviewBeforeGenerate` 한 개를 추가하는 건 작은 변경이지만 이 문서의 범위 밖이라 남긴다 — Phase 1a와 함께 하면 자연스럽다(그쪽도 허용 키를 건드린다).
- **[선행 P1 관계]** 9:16 크롭 프리뷰(선행 라운드 P1)의 재개 시점은 계측 데이터로 결정한다. 다만 두 지표의 도착 시점이 다르다 — `clip_review_opened` 대비 `clip_review_confirmed` 전환율은 **Phase 1a 직후부터** 쌓이지만, `clip_review_generate_blocked`의 사유 분포는 **Phase 1b(= Phase 3 이후)부터**다. 전환율만으로 먼저 판단할지, 사유 분포까지 기다릴지는 그때 정한다.

<!-- doc-validation-restore -->
