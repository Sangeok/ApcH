---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-07-21"
approved-by: null
approved-at: null
approval-scope: null
completed-at: "2026-07-21"
verification-summary: "마이그레이션 전 문서. 개별 검증 기록 없음"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related: []
---

# 클립 검토(Review Needed) UX 개선 — 후회 없는 선택(P0+P2) 기능 개발 문서

Date: 2026-07-21
Status: Proposal (구현 전)
Revision: 2026-07-21 frontend-clean-code-orchestrator 4-렌즈 검증 반영 (수용 9건: Should 5 / Consider 4)
Reconciled: 2026-07-21 reconciling-proposals-with-codebase — Open Questions 3건 전부 코드 증거로 해소
Scope: `docs/proposals/pre-generation-clip-editing-2026-07-20.md`로 구현된 검토 UI의 후속 개선

---

## 1. 배경/동기

### 비즈니스 맥락 (사용자 브리프)

`review_pending`(배지 라벨 "Review Needed") 상태의 클립 검토 UI가 사용자가 쓰기에 적합하지 않다는 판단에서 출발했다. UX 진단 결과 개선 후보를 P0(결함 수준)~P3(폴리시)으로 나눴고, 이 중 **데이터를 더 보지 않고도 진행해도 후회가 없는 P0 + P2 항목만** 이번 범위로 확정했다. 마스터-디테일 재설계·시각적 트리밍·9:16 프리뷰(P1)는 사용 데이터를 확인한 뒤 별도로 결정한다.

### 기술적 맥락 (코드베이스에서 확인한 현재 동작)

검토 UI는 `src/fsd/widgets/clip-draft-review/`에 있고, 소비처는 `src/fsd/pages/upload-detail/ui/index.tsx` 한 곳이다(역검색으로 확인). 다음 5가지 문제를 코드에서 확인했다.

**(1) 저장 전 로컬 상태와 Generate의 불일치 — 의도치 않은 생성·크레딧 차감 가능.**
`ClipDraftCard.tsx`는 `startSeconds`/`endSeconds`/`selected`/`captionStyle`을 전부 카드 로컬 `useState`로 들고, `Save` 버튼을 눌러야만 `saveClipDraftEdit` 서버 액션으로 반영된다. 그런데 섹션 헤더의 선택 개수와 `canGenerate` 가드(`ui/index.tsx:41-52`)는 서버 데이터(`clipDrafts` prop) 기준이다. 사용자가 체크박스를 해제해도 저장 전에는 헤더 카운트가 변하지 않고, 그 상태로 Generate를 누르면 서버에 저장된 예전 선택대로 생성된다. `confirmClipDraftsAndGenerate`(`src/fsd/features/upload/api/index.ts:387-467`)는 DB의 `selected`만 보고 렌더를 스케줄하므로, 화면에서 해제한 클립이 그대로 생성될 수 있다.

**(2) Preview가 실제 클립 구간을 보여주지 않음.**
`handlePreview`(`ui/index.tsx:54-60`)는 원본 영상을 `draft.startSeconds`(서버 저장값)로 시크해 재생만 하고 `endSeconds`에서 멈추지 않는다. 편집 중인 로컬 값이 아니라 저장된 값을 쓰므로, 경계를 조정한 직후에는 조정 전 구간이 재생된다.

**(3) Generate 비활성화 사유가 안 보이고, 확인 절차 없이 진행됨.**
`canGenerate`가 false면 버튼이 조용히 비활성화될 뿐 사유(선택 0개 / `targetClipCount` 초과 / 크레딧 부족)가 표시되지 않는다. 서버 가드에는 겹침 검사(`api/index.ts:442-454`)도 있는데 클라이언트 미러(`ui/index.tsx:46-52`의 주석은 "동일한 규칙의 클라이언트 미러"라고 하지만 겹침은 미러하지 않음)에는 빠져 있어, 겹침 오류는 클릭 후 토스트로만 발견된다. 또한 클릭 즉시 렌더가 스케줄되며 크레딧 소모(렌더 완료 시 차감)에 대한 확인 단계가 없다.

**(4) 카드 정보 위계가 판단을 방해함.**
카드 제목이 "Clip #N"이고, 선택 판단의 핵심 근거인 `hook`/`payoff`는 truncate되는 Badge에 들어 있다(`ClipDraftCard.tsx:154-166`). 클립이 원본의 어느 위치인지(시간 범위)도 메타로 노출되지 않는다.

**(5) 검토 단계 안내 부재 + 페이지 배치.**
섹션에 "무엇을 해야 하는지", "최대 몇 개까지 선택 가능한지(=`targetClipCount`)", "클립당 크레딧 비용" 안내가 없다. 페이지(`pages/upload-detail/ui/index.tsx:90-165`)에서는 검토 섹션이 Summary/Original/Timeline 3카드 그리드 아래에 있고, 그 아래에 이 시점에는 항상 비어 있는 "Generated clips / No clips yet" 섹션이 렌더링된다.

참고로 `review_pending`은 `ACTIVE_PROCESSING_STATUSES`에 포함되지 않아(`entities/uploaded-file/model/processing-status.ts:16-20`) 검토 중에는 폴링·포커스 리페치가 없다(`pages/upload-detail/model/use-live-uploaded-file-detail.ts`). 즉 검토 화면의 서버 상태 갱신은 뮤테이션 후 `invalidateQueries`가 유일한 경로다 — 자동 저장 설계(4장)의 전제가 된다.

---

## 2. 목표 상태

### 목표

1. **자동 저장**: 카드의 구간·선택·캡션 스타일 편집이 명시적 Save 없이 서버에 반영된다. 선택 토글은 즉시, 구간·스타일은 디바운스(600ms) 저장. 헤더 카운트와 Generate 가드는 낙관적 캐시 갱신으로 즉시 일치한다. 카드별 `Save` 버튼은 제거한다.
2. **구간 프리뷰**: Preview는 카드에서 편집 중인 로컬 구간을 재생하고 `endSeconds`에서 정지한다(timeupdate 주기 ~250ms 오버슛 허용).
3. **Generate 투명화**: 비활성화 사유를 인라인으로 표시(서버 가드 4종 미러: 0개 선택 / 상한 초과 / 크레딧 부족 / 겹침), 버튼 라벨에 크레딧 비용 명시, 클릭 시 확인 다이얼로그(개수·크레딧·잔여) 후 진행.
4. **카드 정보 위계**: `hook`을 카드 제목으로(없으면 "Clip #N" 폴백 — `hook`은 nullable, `prisma/schema.prisma:150`), `payoff`를 부제로, `clipType`·시간 범위(`m:ss–m:ss`)·길이를 메타 칩으로 표시.
5. **안내 + 배치**: 섹션 헤더에 규칙 안내 1줄("최대 N개, 클립당 1크레딧, 잔여 M") + Select all/Deselect all. `review_pending`일 때 검토 섹션을 페이지 헤더 바로 아래(3카드 그리드 위)로 올리고, 빈 Generated clips 섹션은 숨긴다.

### 비목표

- **P1 항목 전부**: 마스터-디테일 레이아웃, 타임라인/드래그 트리밍, 9:16 크롭+자막 오버레이 프리뷰, sticky 플레이어. 사용 데이터 확인 후 별도 결정.
- **P3 항목 전부**: `AddCustomClipPanel` 가상화/위치 이동, `applyStyleToAll` 벌크 서버 액션화, 트랜스크립트 로드 실패 안내, shadcn Checkbox 도입 등 접근성 개선.
- **서버 액션·스키마·백엔드 변경 없음**: `saveClipDraftEdit`/`confirmClipDraftsAndGenerate`/`addCustomClipDraft`와 Prisma 스키마는 그대로 사용한다 (자동 저장·일괄 선택 모두 기존 `saveClipDraftEdit` 재사용).
- **검토 플로우 자체의 재검토**(검토 단계 opt-out 등 제품 방향 변경).

### 성공 기준

관찰 가능한 기준 (수동 확인 시나리오는 8장):

- 체크박스 해제 시 헤더 "X of Y moments selected"가 **서버 왕복을 기다리지 않고 즉시** 감소하고, 새로고침 후에도 유지된다.
- 구간을 조정한 뒤 아무 버튼도 누르지 않고 새로고침해도 조정값이 유지된다. 30~90s(`CLIP_DURATION_LIMITS`, `shared/config/constants.ts:37-40`) 밖의 값은 저장되지 않고 "not saved" 안내가 보인다.
- Preview 재생이 편집 중인 `endSeconds`(+최대 ~250ms)에서 멈춘다.
- 가드 4종(0개/상한/크레딧/겹침) 각각에서 버튼이 비활성화되고 해당 사유 문구가 보인다.
- Generate 클릭 시 다이얼로그가 뜨고, Cancel은 아무 변화 없음, 확정 시 기존과 동일하게 진행("Clip generation started" 토스트, `review_pending` 이탈).
- 카드 제목이 hook(폴백 "Clip #N"), 메타에 시간 범위·길이가 보인다.
- `review_pending`에서 검토 섹션이 페이지 헤더 바로 아래 위치하고, `clips.length === 0`이면 Generated clips 섹션이 렌더링되지 않는다. 그 외 상태의 페이지 렌더는 변경 전과 동일하다.
- `npm run check` 통과 (`next lint && tsc --noEmit`, `package.json:12` — 타입 오류 시 실패하는 게이트임을 스크립트 본문으로 확인).

---

## 3. 대안 분석

### 결정 1: 저장 모델

**Option A: 카드 로컬 상태 유지 + 자동 저장(선택 즉시 / 구간·스타일 디바운스) + 낙관적 캐시 갱신 (선택)**

- 장점: 입력 필드가 로컬 상태라 리페치·경합에 흔들리지 않음(타이핑 중 값 되돌아감 없음). 기존 구조에서 diff가 가장 작음. `saveClipDraftEdit`의 payload(`SaveDraftInput`) 계약 그대로.
- 단점: "다른 경로로 서버가 바뀐 값"(Apply to all이 다른 카드 스타일을 변경)과 로컬 상태의 동기화 지점을 설계해야 함. → `styleDirty` 플래그(직접 편집한 카드만 `captionStyle`을 payload에 포함, 나머지는 `undefined`=변경 없음)와 "스타일 에디터를 여는 시점에 서버값 동기화"로 해결(4장).

**Option B: react-query 캐시를 단일 소스로 하는 완전 컨트롤드 방식**

- 장점: 로컬/서버 이중 상태 자체가 사라져 동기화 문제 원천 제거. 구조적으로 가장 깨끗함.
- 단점: 편집이 캐시 쓰기와 결합되어, 디바운스 창(뮤테이션 발화 전) 동안 다른 뮤테이션의 `invalidate` 리페치가 캐시를 덮으면 **입력 중인 값이 화면에서 되돌아가는** 경합이 생긴다(예: 체크박스 즉시 저장 settle → invalidate → 리페치 결과가 아직 저장 안 된 시간 편집을 덮음). 이를 막으려면 pending-편집 추적 계층이 추가로 필요. 개편 폭도 큼 — P1 재설계 시점에 어울리는 방향.

**Option C: 저장 버튼 유지 + dirty 표시 + Generate 차단**

- 장점: 저장 시맨틱 변경 없음, 구현 최소.
- 단점: "편집했으면 저장돼 있어야 한다"는 검토 UI의 기본 기대치를 계속 어긴다. dirty 관리 비용은 A와 비슷하게 들면서 UX 이득이 가장 작음.

**선택: Option A** — 근거: 검토 중에는 폴링·포커스 리페치가 없어(1장 말미) 서버 상태 변경 경로가 이 위젯의 뮤테이션뿐이므로, 로컬 상태 + 낙관적 갱신의 경합 면적이 작다. B의 구조적 이점은 P1 재설계에서 취한다.

### 결정 2: 확인 다이얼로그 구현

**Option A: `radix-ui` 패키지의 `AlertDialog`로 shadcn 스타일 아톰 신설 (선택)**

- 장점: 프로젝트에 `radix-ui@^1.4.3`이 이미 있고(`package.json:50`), `sheet.tsx`가 같은 패키지에서 `Dialog as SheetPrimitive`를 import하는 선례가 있다(`shared/ui/atoms/sheet.tsx:5`). 새 의존성 0개. 포커스 트랩·ESC·오버레이 접근성 기본 제공.
- 단점: 아톰 파일 1개 추가. (`radix-ui` 통합 패키지의 `AlertDialog` export는 `node_modules/radix-ui/dist/index.d.mts:5-6`에서 확인 완료.)

**Option B: `window.confirm`**

- 장점: 코드 3줄.
- 단점: 브라우저 네이티브 UI라 비용(크레딧 수치) 강조·스타일 불가, 프로젝트에 기존 사용례도 없음(검색 결과 0건).

**Option C: 버튼 2단계 확인(클릭 → "정말요? N credits" 상태로 변환)**

- 장점: 컴포넌트 추가 없음.
- 단점: 실수 방지력이 약하고(더블클릭에 뚫림), 잔여 크레딧 등 맥락 표시 공간이 없음.

**선택: Option A** — 근거: 크레딧이 걸린 비가역 액션에는 명시적 모달 확인이 적정 수준이고, 의존성 추가 없이 기존 패턴(sheet)과 동일한 방식으로 만들 수 있다.

---

## 4. 구현 계획

### 신규 코드

| 파일 | 역할 |
|------|------|
| `src/fsd/shared/ui/atoms/alert-dialog.tsx` | radix `AlertDialog` 기반 확인 다이얼로그 아톰 (sheet.tsx의 data-slot 패턴 준수) |

### 기존 코드 수정

| 파일 | 변경 요지 |
|------|------|
| `src/fsd/widgets/clip-draft-review/model/use-clip-draft-review.ts` | `saveMutation`에 낙관적 캐시 갱신 추가, 전체 선택/해제 뮤테이션 추가 |
| `src/fsd/widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx` | 자동 저장 전환, Save 버튼 제거, 정보 위계 개편, 로컬 구간 프리뷰 전달 |
| `src/fsd/widgets/clip-draft-review/ui/index.tsx` | 구간 정지 프리뷰, 가드 사유 표시, 비용 라벨, 확인 다이얼로그, 안내 문구, Select all/none |
| `src/fsd/pages/upload-detail/ui/index.tsx` | `review_pending` 시 검토 섹션 최상단 배치, 빈 Generated clips 숨김 |

---

#### 4.1 `src/fsd/widgets/clip-draft-review/model/use-clip-draft-review.ts`

**After가 보존해야 할 불변식**: 저장 성공 시 서버에 기록되는 값과 최종 캐시 상태는 Before와 동일하다. 추가되는 것은 (a) 뮤테이션 발화 시점의 낙관적 캐시 반영과 실패 시 롤백, (b) 전체 선택/해제 뮤테이션뿐이다.

Before (변경되는 단위인 훅 전체 중, 이번 변경과 무관하게 바이트 동일하게 유지되는 구간은 명시적으로 생략):

```ts
export function useClipDraftReview(
  uploadedFileId: string,
  clipDrafts: ClipDraft[],
) {
  const queryClient = useQueryClient();

  const invalidateDetail = () =>
    queryClient.invalidateQueries({
      queryKey: uploadedFileKeys.detail(uploadedFileId),
    });

  // ... (transcriptWords useQuery — 변경 없음, 생략)

  const saveMutation = useMutation({
    mutationFn: async (input: SaveDraftInput) => {
      const result = await saveClipDraftEdit(input);
      if (!result.success) {
        throw new Error(result.error);
      }
    },
    onSuccess: invalidateDetail,
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to save clip",
      );
    },
  });

  // ... (applyStyleMutation, confirmMutation, addCustomMutation — 변경 없음, 생략)

  return {
    transcriptWords,
    saveDraft: (input: SaveDraftInput) => saveMutation.mutateAsync(input),
    applyStyleToAll: (style: CaptionStyleInput | null) =>
      applyStyleMutation.mutateAsync(style),
    confirmAndGenerate: () => confirmMutation.mutateAsync(),
    addCustomClip: (range: ClipRange) => addCustomMutation.mutateAsync(range),
    isSaving: saveMutation.isPending,
    isApplyingToAll: applyStyleMutation.isPending,
    isConfirming: confirmMutation.isPending,
    isAddingCustom: addCustomMutation.isPending,
  };
}
```

After (import 추가: `import type { UploadedFileDetail } from "~/fsd/entities/uploaded-file/model/types";` — detail 캐시의 실제 형태는 `uploadedFileDetailQueryOptions`가 `uploadedFileKeys.detail`을 queryKey로 쓰는 것을 `features/upload/model/query-options.ts:14-16`에서 확인):

```ts
export function useClipDraftReview(
  uploadedFileId: string,
  clipDrafts: ClipDraft[],
) {
  const queryClient = useQueryClient();

  const detailKey = uploadedFileKeys.detail(uploadedFileId);

  const invalidateDetail = () =>
    queryClient.invalidateQueries({ queryKey: detailKey });

  // ... (transcriptWords useQuery — 변경 없음, 생략)

  const saveMutation = useMutation({
    mutationFn: async (input: SaveDraftInput) => {
      const result = await saveClipDraftEdit(input);
      if (!result.success) {
        throw new Error(result.error);
      }
    },
    // 낙관적 갱신: 헤더 선택 개수와 Generate 가드가 서버 왕복 없이 즉시
    // 일치하도록 detail 캐시의 해당 draft를 먼저 바꾼다. 실패 시 롤백.
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<UploadedFileDetail>(detailKey);

      if (previous) {
        queryClient.setQueryData<UploadedFileDetail>(detailKey, {
          ...previous,
          clipDrafts: previous.clipDrafts.map((draft) =>
            draft.id === input.clipDraftId
              ? {
                  ...draft,
                  startSeconds: input.startSeconds,
                  endSeconds: input.endSeconds,
                  selected: input.selected,
                  // captionStyle은 의도적으로 낙관 반영하지 않는다. 헤더 카운트와
                  // Generate 가드는 selected/start/end만 소비하며, 스타일은
                  // onSettled의 invalidate가 서버 값으로 재동기화한다.
                }
              : draft,
          ),
        });
      }

      return { previous };
    },
    onError: (error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(detailKey, context.previous);
      }
      toast.error(
        error instanceof Error ? error.message : "Failed to save clip",
      );
    },
    onSettled: invalidateDetail,
  });

  // ... (applyStyleMutation, confirmMutation, addCustomMutation — 변경 없음, 생략)

  // 전체 선택/해제. applyStyleMutation과 같은 순차 루프 패턴을 따르되,
  // 단일 카드 토글(saveMutation)과 동일하게 낙관적 갱신으로 헤더 카운트를
  // 즉시 일치시킨다. 일부만 성공한 채 실패할 수 있으므로 onSettled에서
  // 성공/실패 모두 서버 상태로 재동기화한다.
  const setAllSelectionMutation = useMutation({
    mutationFn: async (selected: boolean) => {
      for (const draft of clipDrafts) {
        if (draft.selected === selected) continue;
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
        error instanceof Error
          ? error.message
          : "Failed to update selection",
      );
    },
  });

  return {
    transcriptWords,
    saveDraft: (input: SaveDraftInput) => saveMutation.mutateAsync(input),
    applyStyleToAll: (style: CaptionStyleInput | null) =>
      applyStyleMutation.mutateAsync(style),
    confirmAndGenerate: () => confirmMutation.mutateAsync(),
    addCustomClip: (range: ClipRange) => addCustomMutation.mutateAsync(range),
    // 의도가 이름에 드러나도록 boolean 파라미터 대신 두 액션으로 노출하고,
    // 형제 액션들과 동일하게 Promise를 반환한다(mutateAsync).
    selectAll: () => setAllSelectionMutation.mutateAsync(true),
    deselectAll: () => setAllSelectionMutation.mutateAsync(false),
    // 위젯(확정 다이얼로그)이 소비하는 공유 플래그. 카드 로컬 isSaving
    // (개별 카드 저장 표시)과 스코프가 다르므로 이름으로 구분한다.
    isSavingDraft: saveMutation.isPending,
    isApplyingToAll: applyStyleMutation.isPending,
    isConfirming: confirmMutation.isPending,
    isAddingCustom: addCustomMutation.isPending,
    isSettingSelection: setAllSelectionMutation.isPending,
  };
}
```

주: `onSuccess: invalidateDetail` → `onSettled: invalidateDetail`로 바뀌는 것은 낙관적 갱신 패턴의 요구(실패 시에도 서버 기준 재동기화)다. 낙관 반영 필드는 헤더 카운트·Generate 가드가 실제로 소비하는 `selected`/`startSeconds`/`endSeconds`로 한정한다 — `captionStyle`까지 캐시에 투영하면 서버 영속 매핑(`features/clip-review/api/index.ts:96-101`)을 훅이 복제하게 되어 결합만 늘고 "즉시 일치" 목표에 기여하지 않는다. 스타일은 `onSettled`의 invalidate가 재동기화하며, 그 사이 같은 카드의 스타일 에디터를 다시 열면 직전 서버 값이 보일 수 있으나 이는 `styleDirty`/에디터 오픈 동기화 설계(4.2) 범위 안이다. 남는 투영(구간·선택)도 같은 서버 매핑을 미러하므로 두 지점은 함께 변경해야 한다. 자동 저장이 의존하는 `captionStyle: undefined` = "변경 없음" 계약은 검증 스키마(`features/clip-review/model/schemas.ts:40-41`의 `.nullable().optional()`)와 영속 계층(`entities/clip-draft/api/index.ts:84-86`의 조건부 스프레드)까지 일관됨을 확인했다.

#### 4.2 `src/fsd/widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx`

**After가 보존해야 할 불변식**: 서버로 보내는 데이터 계약(`SaveDraftInput`)과 클라이언트 측 길이 검증 규칙(30~90s에서만 저장)은 Before와 동일하다. 바뀌는 것은 저장 트리거(버튼 → 자동), 프리뷰에 전달하는 값(서버 저장값 → 로컬 편집값), 정보 표시 순서다.

핵심 설계 3가지:

- **선택 토글은 즉시 저장, 구간·스타일은 600ms 디바운스.** 디바운스 타이머는 `useRef`로 관리해, 선택 토글의 즉시 저장이 **대기 중인 타이머를 취소**하고 현재 값 전체를 실어 보낸다(취소하지 않으면 "구간 편집 → 타이머 대기 중 → 체크 해제 → 즉시 저장 → 600ms 뒤 타이머가 stale `selected: true`로 되돌리는" 경합이 생긴다).
- **`styleDirty` 플래그**: 이 카드에서 스타일을 직접 편집했을 때만 payload에 `captionStyle`을 싣는다. 아니면 `undefined`(변경 없음)를 보내, 다른 카드에서 "Apply to all"로 서버에 저장된 스타일을 이 카드의 오래된 로컬 값으로 되돌리는 것을 막는다. 스타일 에디터는 **여는 시점에 서버 저장값으로 로컬을 동기화**하고 `styleDirty`를 리셋한다.
- **범위 밖 값은 저장 보류**: `withinLimits`가 아니면 타이머를 걸지 않고(서버 가드 `saveClipDraftEdit`의 길이 검증과 동일 규칙, `features/clip-review/api/index.ts:90-94`), 기존 길이 안내 문구에 "— not saved"를 덧붙인다. 이 상태에서 체크박스를 토글하면 **마지막으로 저장된 서버 구간을 유지한 채 선택만** 저장한다(선택 의사가 무효 구간 때문에 유실되지 않도록).

Before (변경되는 단위인 컴포넌트 전체 중, 바이트 동일하게 유지되는 구간은 명시적으로 생략 — 파일 상단 `STEP_SECONDS`, `roundTenth`, `formatTime`, `nearestBoundary` 헬퍼는 변경 없음):

```tsx
interface ClipDraftCardProps {
  draft: ClipDraft;
  isActive: boolean;
  language: string;
  transcriptWords: TranscriptWord[];
  onPreview: () => void;
  onSave: (input: SaveDraftInput) => Promise<void>;
  onApplyToAll: (style: CaptionStyle) => void;
  isApplyingToAll: boolean;
}

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
  const [startSeconds, setStartSeconds] = useState<number>(draft.startSeconds);
  const [endSeconds, setEndSeconds] = useState<number>(draft.endSeconds);
  const [selected, setSelected] = useState<boolean>(draft.selected);
  // draft.captionStyle(Prisma JsonValue)를 shared CaptionStyle로 좁히는 유일한 지점.
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle | null>(
    (draft.captionStyle as CaptionStyle | null) ?? null,
  );
  const [styleOpen, setStyleOpen] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const duration = roundTenth(endSeconds - startSeconds);
  const withinLimits =
    duration >= CLIP_DURATION_LIMITS.MIN_SECONDS &&
    duration <= CLIP_DURATION_LIMITS.MAX_SECONDS;

  const wordsInRange = useMemo(
    () =>
      transcriptWords.filter(
        (word) => word.start >= startSeconds && word.end <= endSeconds,
      ),
    [transcriptWords, startSeconds, endSeconds],
  );

  const previewText = wordsInRange.map((word) => word.word).join(" ");

  // ... (adjustStart, adjustEnd, resetToAi — 변경 없음, 생략)

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        clipDraftId: draft.id,
        startSeconds,
        endSeconds,
        selected,
        captionStyle,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        isActive && "ring-2 ring-primary",
        !selected && "opacity-70",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => setSelected(event.target.checked)}
          />
          Clip #{draft.index + 1}
        </label>
        <Button type="button" size="sm" variant="outline" onClick={onPreview}>
          Preview
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {draft.clipType && <Badge variant="secondary">{draft.clipType}</Badge>}
        {draft.hook && (
          <Badge variant="outline" className="max-w-full truncate">
            Hook: {draft.hook}
          </Badge>
        )}
        {draft.payoff && (
          <Badge variant="outline" className="max-w-full truncate">
            Payoff: {draft.payoff}
          </Badge>
        )}
      </div>

      {/* ... (start/end 조정 그리드 — 변경 없음, 생략) */}

      <p
        className={cn(
          "mt-2 text-xs",
          withinLimits ? "text-muted-foreground" : "text-destructive",
        )}
      >
        Length: {duration.toFixed(1)}s
        {!withinLimits &&
          ` (must be ${CLIP_DURATION_LIMITS.MIN_SECONDS}-${CLIP_DURATION_LIMITS.MAX_SECONDS}s)`}
      </p>

      {previewText && (
        <p className="mt-2 line-clamp-3 rounded bg-muted p-2 text-xs">
          {previewText}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={resetToAi}
        >
          Reset to AI suggestion
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setStyleOpen((open) => !open)}
        >
          {styleOpen ? "Hide caption style" : "Caption style"}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!withinLimits || isSaving}
          onClick={handleSave}
        >
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>

      {styleOpen && (
        <CaptionStyleEditor
          language={language}
          value={captionStyle}
          previewWords={wordsInRange.map((word) => word.word)}
          onChange={setCaptionStyle}
          onReset={() => setCaptionStyle(null)}
          onApplyToAll={onApplyToAll}
          isApplyingToAll={isApplyingToAll}
        />
      )}
    </div>
  );
}
```

After (import 변경: `useEffect`, `useRef` 추가, `ClipRange` 타입 추가 — `import type { ClipRange, SaveDraftInput, TranscriptWord } from "../../model/use-clip-draft-review";`):

```tsx
const AUTO_SAVE_DEBOUNCE_MS = 600;

// draft.captionStyle(Prisma JsonValue) → shared CaptionStyle 강제 변환의 단일
// 지점. 초기값과 스타일 에디터 오픈 동기화가 함께 사용한다.
function toCaptionStyle(raw: ClipDraft["captionStyle"]): CaptionStyle | null {
  return (raw as CaptionStyle | null) ?? null;
}

interface ClipDraftCardProps {
  draft: ClipDraft;
  isActive: boolean;
  language: string;
  transcriptWords: TranscriptWord[];
  onPreview: (range: ClipRange) => void;
  onSave: (input: SaveDraftInput) => Promise<void>;
  onApplyToAll: (style: CaptionStyle) => void;
  isApplyingToAll: boolean;
}

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
  const [startSeconds, setStartSeconds] = useState<number>(draft.startSeconds);
  const [endSeconds, setEndSeconds] = useState<number>(draft.endSeconds);
  const [selected, setSelected] = useState<boolean>(draft.selected);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle | null>(
    toCaptionStyle(draft.captionStyle),
  );
  // 이 카드에서 스타일을 직접 편집했을 때만 저장 payload에 captionStyle을 싣는다.
  // false면 undefined(변경 없음)를 보내, Apply to all로 서버에 저장된 스타일이
  // 이 카드의 오래된 로컬 값으로 되돌아가는 것을 막는다.
  const [styleDirty, setStyleDirty] = useState<boolean>(false);
  const [styleOpen, setStyleOpen] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const skipInitialAutoSaveRef = useRef(true);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const duration = roundTenth(endSeconds - startSeconds);
  const withinLimits =
    duration >= CLIP_DURATION_LIMITS.MIN_SECONDS &&
    duration <= CLIP_DURATION_LIMITS.MAX_SECONDS;

  const wordsInRange = useMemo(
    () =>
      transcriptWords.filter(
        (word) => word.start >= startSeconds && word.end <= endSeconds,
      ),
    [transcriptWords, startSeconds, endSeconds],
  );

  const previewText = wordsInRange.map((word) => word.word).join(" ");

  // ... (adjustStart, adjustEnd, resetToAi — 변경 없음, 생략)

  const runSave = async (input: SaveDraftInput) => {
    setIsSaving(true);
    try {
      await onSave(input);
    } catch {
      // 실패 토스트와 캐시 롤백은 saveMutation onError가 처리한다.
      // 로컬 편집값은 유지되어 다음 변경 시 다시 저장을 시도한다.
    } finally {
      setIsSaving(false);
    }
  };

  const clearPendingAutoSave = () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  };

  // 구간·캡션 스타일 변경의 디바운스 자동 저장. 길이 제한 밖 값은 서버 가드와
  // 동일하게 저장하지 않으며, 제한 안으로 돌아오면 그때 저장된다.
  useEffect(() => {
    if (skipInitialAutoSaveRef.current) {
      skipInitialAutoSaveRef.current = false;
      return;
    }
    if (!withinLimits) return;

    clearPendingAutoSave();
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      void runSave({
        clipDraftId: draft.id,
        startSeconds,
        endSeconds,
        selected,
        captionStyle: styleDirty ? captionStyle : undefined,
      });
    }, AUTO_SAVE_DEBOUNCE_MS);

    return clearPendingAutoSave;
    // 의존성 제외는 전부 의도적이다:
    // - selected: handleSelectedChange가 타이머를 취소하고 즉시 저장하는 별도
    //   경로다. 여기 포함하면 토글마다 디바운스 저장이 중복 발화한다.
    // - styleDirty: 항상 captionStyle 변경과 함께만 바뀐다(onChange/onReset/
    //   onApplyToAll/handleToggleStyleOpen). 단독 트리거가 되어선 안 된다.
    // - withinLimits/runSave/clearPendingAutoSave: 렌더마다 재생성되는 파생값/
    //   함수로, 타이머는 이펙트 생성 시점 렌더의 최신 값을 캡처하면 충분하다.
    // 이 배열에 값을 추가하는 "lint 경고 수정"은 stale-타이머 경합을 되살린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSeconds, endSeconds, captionStyle]);

  // 선택 여부는 디바운스 없이 즉시 저장한다. 현재 구간이 길이 제한 밖이라
  // 저장 불가능하면, 마지막으로 저장된 서버 구간을 유지한 채 선택만 반영한다.
  const handleSelectedChange = (nextSelected: boolean) => {
    setSelected(nextSelected);
    clearPendingAutoSave();
    void runSave({
      clipDraftId: draft.id,
      startSeconds: withinLimits ? startSeconds : draft.startSeconds,
      endSeconds: withinLimits ? endSeconds : draft.endSeconds,
      selected: nextSelected,
      captionStyle: styleDirty ? captionStyle : undefined,
    });
  };

  // 에디터를 여는 시점의 서버 저장값을 편집 기준으로 동기화한다
  // (다른 카드에서 Apply to all 한 결과 반영).
  const handleToggleStyleOpen = () => {
    setStyleOpen((open) => {
      const next = !open;
      if (next) {
        setCaptionStyle(toCaptionStyle(draft.captionStyle));
        setStyleDirty(false);
      }
      return next;
    });
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        isActive && "ring-2 ring-primary",
        !selected && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={selected}
            onChange={(event) => handleSelectedChange(event.target.checked)}
          />
          <span>
            <span className="block text-sm leading-snug font-semibold">
              {draft.hook ?? `Clip #${draft.index + 1}`}
            </span>
            {draft.payoff && (
              <span className="text-muted-foreground mt-0.5 line-clamp-2 block text-xs leading-snug">
                {draft.payoff}
              </span>
            )}
          </span>
        </label>
        <div className="flex shrink-0 items-center gap-2">
          {isSaving && (
            <span className="text-muted-foreground text-xs">Saving…</span>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onPreview({ startSeconds, endSeconds })}
          >
            Preview
          </Button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {draft.clipType && <Badge variant="secondary">{draft.clipType}</Badge>}
        <Badge variant="outline">
          {formatTime(startSeconds)}–{formatTime(endSeconds)}
        </Badge>
        <Badge variant="outline">{duration.toFixed(1)}s</Badge>
      </div>

      {/* ... (start/end 조정 그리드 — 변경 없음, 생략) */}

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

      {previewText && (
        <p className="mt-2 line-clamp-3 rounded bg-muted p-2 text-xs">
          {previewText}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={resetToAi}>
          Reset to AI suggestion
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleToggleStyleOpen}
        >
          {styleOpen ? "Hide caption style" : "Caption style"}
        </Button>
      </div>

      {styleOpen && (
        <CaptionStyleEditor
          language={language}
          value={captionStyle}
          previewWords={wordsInRange.map((word) => word.word)}
          onChange={(style) => {
            setStyleDirty(true);
            setCaptionStyle(style);
          }}
          onReset={() => {
            setStyleDirty(true);
            setCaptionStyle(null);
          }}
          onApplyToAll={(style) => {
            // 벌크 저장이 이 카드에도 적용되므로 로컬을 적용값으로 맞추고
            // dirty를 해제해 이후 자동 저장이 스타일을 다시 보내지 않게 한다.
            setStyleDirty(false);
            setCaptionStyle(style);
            onApplyToAll(style);
          }}
          isApplyingToAll={isApplyingToAll}
        />
      )}
    </div>
  );
}
```

새 분기 정리: `skipInitialAutoSaveRef`(마운트 시 저장 방지), `withinLimits ? ... : draft.startSeconds`(무효 구간에서 선택만 저장 — 서버 길이 가드에서 유도), `styleDirty ? captionStyle : undefined`(`SaveDraftInput`의 undefined 계약에서 유도), 에디터 오픈 시 서버값 동기화(신규 설계 — 4.2 서두에 근거 서술). `resetToAi`는 이제 디바운스를 거쳐 자동 저장까지 이어진다(의도된 동작 변경).

#### 4.3 `src/fsd/widgets/clip-draft-review/ui/index.tsx`

**After가 보존해야 할 불변식**: `confirmAndGenerate`가 허용되는 조건은 Before의 `canGenerate`보다 완화되지 않는다(겹침 가드가 추가되어 오히려 서버 거절 케이스가 클라이언트에서 미리 차단됨). 서버 호출 시그니처와 카드 목록 렌더 구조는 동일하다.

Before:

```tsx
export default function ClipDraftReviewSection({
  uploadedFileId,
  clipDrafts,
  targetClipCount,
  currentUserCredits,
  language,
}: ClipDraftReviewSectionProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { playUrl } = usePlayUrl(uploadedFileId, getOriginalPlayUrl);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const {
    transcriptWords,
    saveDraft,
    applyStyleToAll,
    confirmAndGenerate,
    addCustomClip,
    isConfirming,
    isApplyingToAll,
    isAddingCustom,
  } = useClipDraftReview(uploadedFileId, clipDrafts);

  const selectedCount = useMemo(
    () => clipDrafts.filter((draft) => draft.selected).length,
    [clipDrafts],
  );

  // 서버 액션 confirmClipDraftsAndGenerate의 가드(선택 1개 이상, 목표 개수 이하,
  // 크레딧 충분)와 동일한 규칙의 클라이언트 미러.
  const canGenerate =
    !isConfirming &&
    selectedCount > 0 &&
    selectedCount <= targetClipCount &&
    currentUserCredits >= selectedCount;

  const handlePreview = (draft: ClipDraft) => {
    setActiveDraftId(draft.id);
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = draft.startSeconds;
    void video.play();
  };

  return (
    <section className="bg-card rounded-xl border">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <p className="text-muted-foreground text-sm">Review clip plan</p>
          <h2 className="text-xl font-semibold">
            {selectedCount} of {clipDrafts.length} moments selected
          </h2>
        </div>
        <Button onClick={() => confirmAndGenerate()} disabled={!canGenerate}>
          Generate {selectedCount} clip{selectedCount === 1 ? "" : "s"}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl bg-black">
          {playUrl && (
            <video
              ref={videoRef}
              src={playUrl}
              controls
              preload="metadata"
              className="w-full rounded-md object-cover"
            />
          )}
        </div>

        <div className="flex max-h-[560px] flex-col gap-4 overflow-y-auto">
          <AddCustomClipPanel
            transcriptWords={transcriptWords}
            onAdd={addCustomClip}
            isAdding={isAddingCustom}
          />
          {clipDrafts.map((draft) => (
            <ClipDraftCard
              key={draft.id}
              draft={draft}
              isActive={draft.id === activeDraftId}
              language={language}
              transcriptWords={transcriptWords}
              onPreview={() => handlePreview(draft)}
              onSave={saveDraft}
              onApplyToAll={applyStyleToAll}
              isApplyingToAll={isApplyingToAll}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
```

After (import 변경: `useEffect` 추가, alert-dialog 아톰 import 추가, `import type { ClipRange } from "../model/use-clip-draft-review";` 추가):

```tsx
// 서버 액션 confirmClipDraftsAndGenerate의 가드(선택 1개 이상, 목표 개수 이하,
// 크레딧 충분, 구간 비겹침)와 동일한 규칙의 클라이언트 미러.
// 위에서부터 첫 번째로 걸리는 사유 하나만 반환한다.
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

export default function ClipDraftReviewSection({
  uploadedFileId,
  clipDrafts,
  targetClipCount,
  currentUserCredits,
  language,
}: ClipDraftReviewSectionProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { playUrl } = usePlayUrl(uploadedFileId, getOriginalPlayUrl);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  // 프리뷰 종료 시각. ref로 두어 timeupdate 리스너를 재구독 없이 유지한다.
  const previewEndRef = useRef<number | null>(null);
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

  const handlePreview = (draftId: string, range: ClipRange) => {
    setActiveDraftId(draftId);
    const video = videoRef.current;
    if (!video) return;
    previewEndRef.current = range.endSeconds;
    video.currentTime = range.startSeconds;
    void video.play();
  };

  // 프리뷰 구간의 끝에서 재생을 멈춘다. timeupdate 주기(~250ms)만큼
  // 오버슛할 수 있다.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const end = previewEndRef.current;
      if (end !== null && video.currentTime >= end) {
        video.pause();
        previewEndRef.current = null;
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [playUrl]);

  const clipNoun = selectedCount === 1 ? "clip" : "clips";
  const creditNoun = selectedCount === 1 ? "credit" : "credits";

  return (
    <section className="bg-card rounded-xl border">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b px-6 py-4">
        <div>
          <p className="text-muted-foreground text-sm">Review clip plan</p>
          <h2 className="text-xl font-semibold">
            {selectedCount} of {clipDrafts.length} moments selected
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Pick up to {targetClipCount} moments, fine-tune each range, then
            generate. Each generated clip uses 1 credit — you have{" "}
            {currentUserCredits}.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={!canGenerate}>
                Generate {selectedCount} {clipNoun} · {selectedCount}{" "}
                {creditNoun}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Generate {selectedCount} {clipNoun}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will render the {selectedCount} selected {clipNoun} and
                  use up to {selectedCount} of your {currentUserCredits}{" "}
                  {creditNoun}. The review step closes once rendering starts.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel asChild>
                  <Button variant="outline">Cancel</Button>
                </AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button
                    disabled={isSavingDraft}
                    onClick={() => confirmAndGenerate()}
                  >
                    Start generating
                  </Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {generateBlockReason && (
            <p className="text-destructive max-w-[260px] text-right text-xs">
              {generateBlockReason}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl bg-black">
          {playUrl && (
            <video
              ref={videoRef}
              src={playUrl}
              controls
              preload="metadata"
              className="w-full rounded-md object-cover"
            />
          )}
        </div>

        <div className="flex max-h-[560px] flex-col gap-4 overflow-y-auto">
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
          <AddCustomClipPanel
            transcriptWords={transcriptWords}
            onAdd={addCustomClip}
            isAdding={isAddingCustom}
          />
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
        </div>
      </div>
    </section>
  );
}
```

주: `AlertDialogAction`의 `disabled={isSavingDraft}`는 **단일 카드 저장이 in-flight인 순간**의 확정만 막는 안전장치다(리스크 2 참조). 일괄 선택(`isSettingSelection`)·Apply to all(`isApplyingToAll`)·디바운스 대기 창은 의도적으로 막지 않는다 — 서버가 확정 시 DB의 `selected`·길이·겹침·크레딧을 전부 재검증하므로 잘못된 생성은 불가능하고, 더 넓게 막아서 얻는 것은 마지막 1초 미만 편집의 반영뿐이다. 다이얼로그의 숫자는 낙관적 갱신 덕에 최신 서버 의도와 일치한다. `Start generating` 클릭 시 radix 기본 동작으로 다이얼로그가 닫히고 뮤테이션이 진행되며, 실패 시 기존 `confirmMutation.onError` 토스트가 노출된다(기존 호출 패턴 `onClick={() => confirmAndGenerate()}` 유지).

#### 4.4 `src/fsd/shared/ui/atoms/alert-dialog.tsx` (신규)

`sheet.tsx`의 패턴(통합 `radix-ui` 패키지에서 네임스페이스 import, `data-slot` 속성, `cn` 유틸)을 따른다. `radix-ui@1.4.3`이 `AlertDialog` 네임스페이스를 export하고(`node_modules/radix-ui/dist/index.d.mts:5-6`), 아래에서 사용하는 `Root`/`Trigger`/`Portal`/`Overlay`/`Content`/`Action`/`Cancel`/`Title`/`Description`이 전부 제공됨을 확인했다(`@radix-ui/react-alert-dialog/dist/index.d.mts:41-49`). Action/Cancel은 스타일 없는 primitive로 두고 호출부가 `asChild`로 기존 `Button` 아톰을 감싼다(`buttonVariants` 등 미확인 export 의존 회피).

```tsx
"use client";

import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";

import { cn } from "~/fsd/shared/lib/utils";

function AlertDialog(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Root>,
) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>,
) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  );
}

function AlertDialogPortal(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Portal>,
) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  );
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn("fixed inset-0 z-50 bg-black/50", className)}
      {...props}
    />
  );
}

function AlertDialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          "bg-background fixed top-1/2 left-1/2 z-50 grid w-full max-w-md",
          "-translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border p-6 shadow-lg",
          className,
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn("flex justify-end gap-2", className)}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-lg font-semibold", className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function AlertDialogAction(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Action>,
) {
  return (
    <AlertDialogPrimitive.Action data-slot="alert-dialog-action" {...props} />
  );
}

function AlertDialogCancel(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>,
) {
  return (
    <AlertDialogPrimitive.Cancel data-slot="alert-dialog-cancel" {...props} />
  );
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
```

#### 4.5 `src/fsd/pages/upload-detail/ui/index.tsx`

**After가 보존해야 할 불변식**: `review_pending`이 아닌 모든 상태에서 렌더 트리는 Before와 동일하다.

Before (변경되는 단위인 컴포넌트의 return JSX 중심 — analytics `useEffect`와 구조 분해는 변경 없음, 생략):

```tsx
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        {/* ... (헤더 내용 — 변경 없음, 생략) */}
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ... (Summary / OriginalMediaCard / Processing timeline 카드 — 변경 없음, 생략) */}
      </section>

      {status === "review_pending" && clipDrafts.length > 0 && (
        <ClipDraftReviewSection
          uploadedFileId={uploadedFileId}
          clipDrafts={clipDrafts}
          targetClipCount={targetClipCount}
          currentUserCredits={currentUserCredits}
          language={language}
        />
      )}

      <section className="bg-card rounded-xl border">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <p className="text-muted-foreground text-sm">Generated clips</p>
            <h2 className="text-xl font-semibold">
              {clips.length > 0
                ? `${clips.length} clip${clips.length > 1 ? "s" : ""}`
                : "No clips yet"}
            </h2>
          </div>
        </div>
        <div className="px-6 py-6">
          <Suspense
            fallback={<p className="text-muted-foreground">Loading clips...</p>}
          >
            {clips.length > 0 ? (
              <ClipDisplay clips={clips} />
            ) : (
              <p className="text-muted-foreground text-center">
                No clips generated yet
              </p>
            )}
          </Suspense>
        </div>
      </section>
    </div>
  );
```

After (컴포넌트 본문에 `isUnderReview` 파생값 1개 추가):

```tsx
  // 검토 단계에서는 검토 섹션이 핵심 작업이므로 요약 카드보다 먼저 배치하고,
  // 이 시점에 항상 비어 있는 Generated clips 섹션은 숨긴다.
  // 두 판정은 함께 바뀌는 "검토 모드 레이아웃" 결정이므로 나란히 명명해 둔다.
  const isUnderReview = status === "review_pending" && clipDrafts.length > 0;
  const showGeneratedClips = status !== "review_pending" || clips.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        {/* ... (헤더 내용 — 변경 없음, 생략) */}
      </header>

      {isUnderReview && (
        <ClipDraftReviewSection
          uploadedFileId={uploadedFileId}
          clipDrafts={clipDrafts}
          targetClipCount={targetClipCount}
          currentUserCredits={currentUserCredits}
          language={language}
        />
      )}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ... (Summary / OriginalMediaCard / Processing timeline 카드 — 변경 없음, 생략) */}
      </section>

      {showGeneratedClips && (
        <section className="bg-card rounded-xl border">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <div>
              <p className="text-muted-foreground text-sm">Generated clips</p>
              <h2 className="text-xl font-semibold">
                {clips.length > 0
                  ? `${clips.length} clip${clips.length > 1 ? "s" : ""}`
                  : "No clips yet"}
              </h2>
            </div>
          </div>
          <div className="px-6 py-6">
            <Suspense
              fallback={
                <p className="text-muted-foreground">Loading clips...</p>
              }
            >
              {clips.length > 0 ? (
                <ClipDisplay clips={clips} />
              ) : (
                <p className="text-muted-foreground text-center">
                  No clips generated yet
                </p>
              )}
            </Suspense>
          </div>
        </section>
      )}
    </div>
  );
```

Generated clips 숨김 조건을 `clips.length === 0`으로 한정한 근거(코드 확인): detail의 `clips`는 `lastSuccessfulAttempt`의 클립만 조회한다(`entities/uploaded-file/api/index.ts:413-424`). 따라서 재처리 후 재검토(`review_pending` && 이전 성공 attempt 존재) 중에는 기존 클립이 실제로 조회·표시되어 섹션이 유지되고, 숨김은 성공 attempt가 없는 첫 검토에만 적용된다 — 의도된 동작이다.

---

## 5. 실행 순서

각 phase는 독립적으로 검증·커밋 가능한 단위다. Phase 1이 가장 중요한 결함 수정이라 최우선이고, Phase 3(가드 사유)은 자동 저장 이후에 넣어야 사유가 실시간으로 정확해진다.

### Phase 1: 자동 저장 전환 (P0-1)
- 작업: 4.1(훅 낙관적 갱신 + `selectAll`/`deselectAll` 뮤테이션 추가), 4.2 중 자동 저장 부분(디바운스/즉시 저장/`styleDirty`/Save 버튼 제거).
- 검증: 체크 해제 → 헤더 카운트 즉시 감소 → 새로고침 후 유지 / 시간 편집 → 0.6s 후 "Saving…" 표시 → 새로고침 후 유지 / 범위 밖 값 → "not saved" 표시, 새로고침 시 서버값 유지 / 다른 카드에서 Apply to all → 이 카드 에디터를 열면 적용된 스타일 표시 / `npm run check`.

### Phase 2: 구간 프리뷰 (P0-2)
- 작업: 4.2의 `onPreview({ startSeconds, endSeconds })` + 4.3의 `previewEndRef`/`timeupdate` 정지.
- 검증: 경계 조정 직후 Preview → 조정된 시작점부터 재생, 끝점(±0.25s)에서 정지 / 다른 카드 Preview 연속 클릭 시 새 구간으로 전환.

### Phase 3: Generate 가드 사유 + 비용 라벨 + 확인 다이얼로그 (P0-3)
- 작업: 4.4 아톰 신설 → 4.3의 `generateBlockReason`/`hasOverlap`/다이얼로그.
- 검증: 가드 4종 각각 재현(전부 해제 / 상한 초과 선택 / 크레딧 부족 계정 / 겹치는 구간 저장) → 버튼 비활성 + 해당 사유 문구 / 다이얼로그 Cancel → 무변화, 확정 → "Clip generation started" 토스트 및 상태 전이.

### Phase 4: 카드 정보 위계 (P2)
- 작업: 4.2의 헤더(hook 제목/payoff 부제) + 메타 칩(시간 범위·길이).
- 검증: hook 있는 카드/없는 카드(커스텀 클립) 각각 제목 확인, truncate 없이 판독 가능.

### Phase 5: 안내 문구 + Select all/Deselect all (P2)
- 작업: 4.3의 헤더 안내 1줄 + 목록 상단 버튼 2개.
- 검증: Deselect all → 카운트가 서버 왕복 없이 즉시 0(낙관적 갱신), Generate 비활성 + 사유 표시 → Select all → 복귀. 진행 중 버튼 비활성화 확인.

### Phase 6: 페이지 배치 조정 (P2)
- 작업: 4.5.
- 검증: `review_pending`에서 검토 섹션이 헤더 바로 아래, 빈 Generated clips 미표시 / `processed`·`failed`·`processing` 상태 페이지는 변경 전과 동일 렌더.

---

## 6. 영향 범위

- **직접 수정 대상**: 4장 표의 4개 파일 + 신규 1개.
- **import 변경 필요**: 4.1(`UploadedFileDetail` 타입), 4.2(`useEffect`/`useRef`, `ClipRange` 타입), 4.3(`useEffect`, alert-dialog 아톰, `ClipRange` 타입). FSD 방향(위젯 → 엔티티/shared) 준수.
- **외부 의존성**: 추가 없음. `radix-ui@^1.4.3`(`package.json:50`) 기존 의존성 사용.
- **소비자/사용처 영향**: `ClipDraftReviewSection`의 소비처는 `pages/upload-detail/ui/index.tsx` 1곳(프로젝트 전체 역검색 grep 기준; 이 코드베이스는 문자열 키 라우팅·DI로 위젯을 참조하는 패턴이 없어 grep으로 충분하다고 판단). `ClipDraftCard`/`AddCustomClipPanel`/`CaptionStyleEditor`는 위젯 내부 전용. 서버 액션(`saveClipDraftEdit` 등)과 `SaveDraftInput` 계약은 시그니처 무변경이므로 `features/clip-review`·백엔드 영향 없음. `UploadedFileStatusBadge`·대시보드 목록 무변경.

---

## 7. 리스크 + 롤백 전략

### 리스크

1. **자동 저장 요청 빈도 증가** (가능성 높음 / 영향 낮음): 편집마다 `saveClipDraftEdit`(DB 1건 update + `revalidatePath`)가 호출된다. 600ms 디바운스로 상한이 잡히고 검토 화면은 폴링이 없어 총량은 작지만, 서버 로그에서 빈도를 확인할 것.
2. **디바운스 창 내 Generate 확정** (가능성 낮음 / 영향 낮음): 편집 후 600ms 안에 다이얼로그를 열고 즉시 확정하면 마지막 편집이 미반영될 수 있다. 완화: `AlertDialogAction`은 단일 카드 저장 in-flight(`isSavingDraft`) 동안 비활성, 다이얼로그 상호작용 자체가 디바운스보다 길며, 서버가 어차피 길이·겹침·크레딧을 재검증하므로 **잘못된 생성은 불가능**하고 최악은 직전 1초 미만의 편집 누락이다. 이 가드는 일괄 선택·Apply to all in-flight를 의도적으로 막지 않는다(4.3 주 참조 — 서버 재검증이 최종 방어선).
3. **연속 저장의 도착 순서 역전** (가능성 낮음 / 영향 낮음): 같은 카드의 저장 2건이 서버에 역순 도착하면 마지막 도착이 이긴다. payload가 항상 전체 상태(구간+선택)라 필드 단위로 찢어지지는 않고, 즉시 저장이 대기 타이머를 취소하는 설계로 동시 in-flight 창을 줄였다.
4. **이중 확정·동시 세션** (가능성 낮음 / 영향 낮음): Generate를 연속 확정하거나 같은 사용자의 두 세션이 동시에 검토를 조작해도 중복 렌더·중복 차감은 없다 — 확정은 `scheduleProcessingAttempt`가 `review_pending` 상태에서만 attempt를 원자적으로 claim하며(`features/upload/api/index.ts:71-78`, 상태 가드 `:420-422`), 두 번째 확정은 "This upload is not currently under review"로 거절된다. draft 저장은 행 전체 갱신이라 동시 편집도 last-write-wins로 수렴한다(`entities/clip-draft/api/index.ts:80-88`).
5. **낙관적 갱신과 초기 데이터의 상호작용**: detail 쿼리는 `initialData`(서버 컴포넌트 전달)를 쓰므로(`use-live-uploaded-file-detail.ts:19`), `cancelQueries`+롤백 스냅샷 패턴이 초기 데이터를 덮어쓰는 경우는 없는지 Phase 1 검증 시나리오에 새로고침 직후 편집 케이스를 포함한다.

### 롤백 전략

- 스키마·서버 액션 변경이 없으므로 **프론트엔드 커밋 revert만으로 완전 복구**된다. Phase별로 커밋을 분리해 문제 지점만 되돌릴 수 있게 한다.
- Phase 1이 문제를 일으키면 Phase 1 커밋만 revert해도 나머지 phase(프리뷰·다이얼로그·위계·배치)는 독립적으로 유지 가능하다 — 단, Phase 3의 "사유 실시간 정확성"은 자동 저장 전제이므로 함께 revert 여부를 판단한다.

---

## 8. 검증 전략

- **기존 테스트**: 프론트엔드에 자동화 테스트 파일 없음(`**/*.{test,spec}.{ts,tsx}` 글롭 0건). 이번 변경에서 새 자동화 테스트를 성공 기준으로 삼지 않고 수동 검증으로 확정한다. 테스트 하네스 도입 여부는 이 문서 범위 밖의 후속 판단이다.
- **타입/빌드 검증**: `npm run check` = `next lint && tsc --noEmit`(`package.json:12`). `tsc --noEmit`이 타입 오류에서 비정상 종료하므로 pass/fail 게이트로 유효하다. 각 phase 완료 시 실행.
- **수동 확인** (각 phase의 검증 항목에 더해, 전체 완료 후 통합 시나리오):
  1. 검토 진입 → 카드 2개 체크 해제 → 헤더 카운트 즉시 반영 → 새로고침 → 유지 → Generate 라벨/비용 일치.
  2. 구간을 25s(범위 밖)로 → "not saved" → 40s로 복귀 → 0.6s 후 저장 → 새로고침 유지.
  3. 구간 조정 직후 Preview → 조정된 구간 재생·정지.
  4. 카드 A에서 스타일 편집 → Apply to all → 카드 B 에디터 열기 → 적용된 스타일 표시 → 카드 B 구간만 편집 → 새로고침 → B의 스타일이 적용값 그대로인지(styleDirty 회귀 방지 핵심 시나리오).
  5. 가드 4종 각각의 사유 문구 → 해소 → 다이얼로그 확정 → "Clip generation started" → `review_pending` 이탈, 이후 기존 렌더 플로우 정상.
  6. `processed`/`failed` 상태 상세 페이지가 변경 전과 동일하게 보이는지.

