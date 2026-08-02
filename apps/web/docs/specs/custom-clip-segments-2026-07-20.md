# 커스텀 구간 추가(AI 후보 + 사용자 정의 하이브리드) 기능 개발 문서

Date: 2026-07-20
Status: **Implemented** — 커밋 `8ab82e5` (feat: clip review UX hardening on pre-generation review flow)
Verified: 2026-07-28 (§4·§5 Core 전 표면 코드 대조 + `npm run check` 통과)

이 문서는 구현 전 제안서로 작성되어, 출하된 코드와 대조·정정을 거쳐 **완료된 스펙**으로 보존한다.
§4 스니펫은 실제 출하 코드를 반영하도록 갱신되었으며, 미구현으로 남은 항목은 Open Questions에
결정 상태와 함께 명시했다.

---

## 1. 배경/동기

### 비즈니스 맥락 (사용자 브리프)

현재 "생성 전 검토(Review before generate)" 모드는 **AI가 제안한 후보 구간만** 편집·선택할 수 있다. 사용자가 "AI가 놓쳤지만 내가 아는 좋은 순간"을 클립으로 추가할 방법이 없다. 이번 기능의 목표는 검토 화면에서 **AI 후보에 더해, 사용자가 전사(transcript)를 보고 직접 구간을 지정해 클립 후보로 추가**할 수 있게 하는 것이다. AI가 무거운 발굴을 계속 대신하고, 커스텀 추가는 "AI가 놓친 예외"만 보완하는 보조 수단이다(= AI 없이 blind 선택하는 방식이 아니다).

### 기술적 맥락 (코드베이스에서 확인)

검토 파이프라인은 이미 구현되어 있고, 커스텀 구간은 그 위에 **얕게 얹힌다**. 확인한 사실:

- **`ClipDraft` 모델**(`prisma/schema.prisma:133-166`)은 이미 사용자 편집을 담는 구조다: `aiStartSeconds`/`aiEndSeconds`(불변 원안), `startSeconds`/`endSeconds`(편집값), `clipType`/`hook`/`payoff`(전부 `String?`), `selected Boolean @default(true)`, `captionStyle Json?`. 유니크 제약은 `@@unique([uploadedFileId, attempt, index])`.
- **렌더 디스패치 매핑**(`src/fsd/entities/clip-draft/api/index.ts`의 `getSelectedRenderMomentsForAttempt`)은 선택된 draft를 백엔드 moment 계약으로 변환하며, `index`를 **응답 순서(0..n-1)로 재부여**한다(`drafts.map((draft, order) => ({ index: order, ... }))`). 즉 draft의 `index` 값 자체는 유니크성·정렬에만 쓰이고 렌더 결과 파일 번호에는 영향을 주지 않는다.
- **확정 액션**(`src/fsd/features/upload/api/index.ts`의 `confirmClipDraftsAndGenerate`)은 **선택된 모든 draft**에 대해 겹침(`next.startSeconds < prev.endSeconds` → "Selected clips must not overlap", :451-452), 30~90초(`isClipDurationWithinLimits(draft...)`, :457), 개수(`selectedDrafts.length > file.targetClipCount`, :432), 크레딧을 검증한다. **커스텀 draft도 자동으로 같은 검증을 받는다.**
- **백엔드 렌더 경로**(`ai-podcast-clipper-backend/main.py`의 `_do_process_video` render 분기)는 전달받은 moment 목록을 그대로 렌더링하고 `moment.get("type")`/`.get("hook")`/`.get("payoff")`를 읽는다(값이 `None`이어도 안전). 구간의 출처(AI/사용자)를 구분하지 않는다.
- **검토 UI**는 이미 **전사(transcript.json)를 로드**한다: `src/fsd/widgets/clip-draft-review/model/use-clip-draft-review.ts`의 `transcriptWords`(`TranscriptWord = { start; end; word }`)가 단어 단위로 제공된다.

결론: 커스텀 구간은 백엔드·디스패처·확정 액션·스키마 변경 없이, **"전사에서 구간 선택 → ClipDraft 1행 생성" 한 갈래**만 추가하면 성립한다.

---

## 2. 목표 상태

### 목표

- `review_pending` 검토 화면에서 사용자가 **전사 텍스트의 구간을 선택**(시작 단어 → 종료 단어)해 **커스텀 클립을 추가**할 수 있다.
- 추가된 커스텀 클립은 **AI 후보 카드와 완전히 동일하게 동작**한다: 시작/종료 조정, 캡션 스타일 편집, 선택 토글, "Reset to AI suggestion"(커스텀은 자기 원안 = 생성 시 구간으로 복귀).
- 확정 시 커스텀 클립도 AI 클립과 **동일한 렌더 경로**로 생성된다(선택 구간만 렌더, 사용자 캡션 스타일 반영). 백엔드는 무변경.
- 커스텀 draft는 **분석 attempt(`reviewAttempt`)** 에 속하며, 기존 `getUploadedFileDetailsById`의 clipDraft 로드에 자연히 포함된다.

### 비목표

- **백엔드 변경**: `main.py`·디스패처·확정 액션·Prisma 스키마는 이번 범위에서 수정하지 않는다(렌더 계약이 이미 임의 구간을 수용).
- **타임라인 스크러버/파형 UI**: 구간 선택은 전사 단어 선택으로 한다. 썸네일/파형 기반 스크럽은 범위 밖.
- **숫자 입력 폴백**: 출하 시 제외했다. 전사가 비어 있으면 패널 자체를 렌더하지 않는다(아래 §3 선택 참조).
- **재분석 없는 신규 전사**: 커스텀 구간은 **기존 전사가 있는 검토 상태에서만** 추가 가능하다(전사가 없으면 단어 스냅·텍스트 미리보기 불가).
- **targetClipCount 상향**: 커스텀 추가도 기존 `targetClipCount` 한도 안에서 동작한다(정책은 Open Questions).
- **커스텀 draft의 hook/payoff 자동 생성**: AI 메타데이터 없이 null로 둔다(자동 요약 생성은 범위 밖).

### 성공 기준

- 검토 화면에서 전사 구간을 선택해 "Add clip"을 누르면, `ClipDraft` 1행이 생성된다: `attempt == reviewAttempt`, 고유 `index`, `aiStartSeconds == startSeconds`, `aiEndSeconds == endSeconds`, `selected == true`.
- 추가 직후 새 카드가 검토 목록에 나타나고(detail invalidate로 갱신), 시작/종료 조정·캡션 편집이 AI 카드와 동일하게 동작한다.
- 30초 미만/90초 초과 구간은 추가가 거부된다(서버 액션 `addCustomClipDraftSchema.refine`).
- 커스텀 클립을 선택해 확정하면 해당 구간이 실제 클립으로 생성되고, `Clip.startSeconds`/`endSeconds`가 커스텀 구간과 일치한다.
- 커스텀 클립이 다른 선택 클립과 겹치면 확정 시 기존 겹침 검증에 걸린다("Selected clips must not overlap").
- `npm run check`(lint + typecheck) 통과.

---

## 3. 대안 분석

### Option A: 전사 단어 선택 (시작 단어 클릭 → 종료 단어 클릭) — 선택

검토 화면에 전사 단어를 클릭 가능한 텍스트로 렌더하고, 사용자가 시작/종료 단어를 클릭하면 그 구간의 `word.start`~`word.end`로 범위를 잡는다.

- 장점: 이미 로드된 `transcriptWords`를 그대로 활용, **단어 경계에 자동 스냅**되어 정확함. "무슨 말인지" 보면서 고를 수 있어 UX가 자연스러움. 백엔드 무변경.
- 단점: 긴 전사(수천 단어)를 전부 렌더하면 무거울 수 있음(가상화는 후속). 초기 UI 작업이 Option C보다 큼.

### Option B: 재생 헤드 시딩 (현재 재생 위치에서 기본 30초 창 생성 후 카드에서 조정)

"Add clip" 시 현재 `<video>` 재생 위치를 시작으로 기본 창을 만들고, 사용자가 카드 에디터에서 미세 조정.

- 장점: UI가 가장 가벼움(기존 비디오 플레이어 재사용).
- 단점: 전사 문맥 없이 시작점을 잡아 부정확, 결국 카드에서 다시 맞춰야 함.

### Option C: 숫자 입력만 (start/end 초 직접 입력)

- 장점: 구현 최소.
- 단점: 어느 구간이 무슨 내용인지 전혀 안 보임 → 사실상 blind 선택에 가까워 이 기능의 취지와 어긋남.

### 선택: Option A (Option C 폴백 없이 출하)

- 근거: `transcriptWords`가 이미 검토 화면에 로드되어 있어 추가 데이터가 필요 없고, 단어 스냅으로 정확도가 높으며 "내용을 보고 고른다"는 하이브리드의 취지에 가장 맞다.
- **전사가 비어 있는 경우(로드 실패 등)의 결정**: 제안 단계에서는 Option C(숫자 입력) 폴백을 열어 뒀으나, 출하 시에는 폴백을 넣지 않고 **패널을 렌더하지 않는 쪽**을 택했다(`AddCustomClipPanel`의 `transcriptWords.length === 0 → return null`). 근거: 전사 없이 초 단위로만 고르는 것은 §3 Option C의 단점(blind 선택)이 그대로 발현되어 이 기능의 취지와 어긋나고, 전사 로드 실패는 예외 경로라 별도 UI를 유지할 값이 없다.

---

## 4. 구현 계획

### 신규 코드

| 파일 | 역할 |
|------|------|
| `src/fsd/widgets/clip-draft-review/ui/_component/AddCustomClipPanel.tsx` | 전사 단어 선택 → 구간 확정 → "Add clip" 패널 |

### 기존 코드 수정

**`src/fsd/entities/clip-draft/api/index.ts` — 커스텀 draft 생성 함수 추가**

기존 파일에는 `createClipDraftsBulk`(bulk `createMany skipDuplicates`)만 있고 단건 커스텀 생성이 없다. 다음 함수를 추가한다. `index`는 attempt 내 기존 최대값+1로 부여해 AI draft(0..N-1) 뒤에 정렬되게 한다:

```ts
// Creates a single user-authored draft for an attempt, ordered after existing drafts.
// aiStart/aiEnd == start/end 로 두어 "Reset to AI"가 사용자 자신의 원안으로 되돌아가게 한다.
export async function createCustomClipDraft(
  uploadedFileId: string,
  attempt: number,
  args: { startSeconds: number; endSeconds: number },
) {
  // 이 함수는 sibling 엔티티 함수들과 달리 자체 트랜잭션을 소유한다(호출자 tx를 받지 않음):
  // max(index)+1 읽기와 create를 한 트랜잭션에 묶기 위해서다. 단, Prisma 기본 격리
  // 수준에서는 aggregate 범위가 잠기지 않으므로 동시 추가 시 두 트랜잭션이 같은 max를
  // 읽어 P2002가 날 수 있다(문서 §7 리스크 #1 — 단일 사용자 UI라 재시도 하드닝은 유예).
  return db.$transaction(async (tx) => {
    const aggregate = await tx.clipDraft.aggregate({
      where: { uploadedFileId, attempt },
      _max: { index: true },
    });

    const nextIndex = (aggregate._max.index ?? -1) + 1;

    return tx.clipDraft.create({
      data: {
        uploadedFileId,
        attempt,
        index: nextIndex,
        aiStartSeconds: args.startSeconds,
        aiEndSeconds: args.endSeconds,
        startSeconds: args.startSeconds,
        endSeconds: args.endSeconds,
        selected: true,
      },
      select: { id: true },
    });
  });
}
```

배럴(`src/fsd/entities/clip-draft/index.ts`)의 명시적 export 목록에 `createCustomClipDraft`를 추가한다(이 배럴은 `export { ... } from "./api"` 방식이라 누락 시 컴파일 실패).

**`src/fsd/features/clip-review/model/schemas.ts` — 커스텀 추가 입력 스키마**

기존 `updateClipDraftSchema`의 `refine(isClipDurationWithinLimits)` 패턴을 그대로 미러링한다:

```ts
export const addCustomClipDraftSchema = z
  .object({
    uploadedFileId: z.string().cuid(),
    startSeconds: z.number().min(0),
    endSeconds: z.number().positive(),
  })
  .refine(
    (value) => isClipDurationWithinLimits(value.startSeconds, value.endSeconds),
    {
      message: `Clip length must be between ${CLIP_DURATION_LIMITS.MIN_SECONDS}s and ${CLIP_DURATION_LIMITS.MAX_SECONDS}s`,
    },
  );
```

(`isClipDurationWithinLimits`·`CLIP_DURATION_LIMITS`는 이 파일에서 이미 import 중이다.)

**`src/fsd/features/clip-review/api/index.ts` — 커스텀 추가 서버 액션**

기존 `saveClipDraftEdit`(auth → validate → review_pending 확인 → 엔티티 호출 → revalidate) 구조를 미러링한다:

```ts
export async function addCustomClipDraft(input: {
  uploadedFileId: string;
  startSeconds: number;
  endSeconds: number;
}): Promise<ActionResult<{ clipDraftId: string }>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  const validated = addCustomClipDraftSchema.safeParse(input);

  if (!validated.success) {
    return failure(validated.error.issues[0]?.message ?? "Invalid clip");
  }

  const { uploadedFileId, startSeconds, endSeconds } = validated.data;

  try {
    const file = await db.uploadedFile.findFirst({
      where: { id: uploadedFileId, userId: authResult.data.userId },
      select: { id: true, status: true, reviewAttempt: true },
    });

    if (!file) {
      return failure("Uploaded file not found");
    }

    if (file.status !== "review_pending" || file.reviewAttempt === null) {
      return failure("This upload is not currently under review");
    }

    const created = await createCustomClipDraft(file.id, file.reviewAttempt, {
      startSeconds,
      endSeconds,
    });

    revalidatePath(`/dashboard/uploads/${file.id}`);
    return success({ clipDraftId: created.id });
  } catch (error) {
    console.error("Failed to add custom clip draft", error);
    return failure("Failed to add clip");
  }
}
```

import 추가: `createCustomClipDraft`(`~/fsd/entities/clip-draft`), `addCustomClipDraftSchema`(`../model/schemas`). 배럴(`src/fsd/features/clip-review/index.ts`)에 `addCustomClipDraft` export 추가.

**`src/fsd/widgets/clip-draft-review/model/use-clip-draft-review.ts` — 추가 mutation**

먼저 이 파일의 `SaveDraftInput` 옆에 커스텀 구간 입력 형태를 **단일 타입**으로 정의한다(위젯 계층 3개 사용처 — mutationFn 인자, `addCustomClip` 반환, 패널 `onAdd` prop — 이 인라인으로 재선언하지 않게). **주의:** 이 타입을 하위 계층인 entity의 `createCustomClipDraft` `args`나 feature action `addCustomClipDraft` `input`으로 내려보내지 말 것 — 위젯 타입을 하위 계층이 import하면 FSD 상향 import 위반이다. 그 두 곳은 각자 로컬 인라인 형태를 유지한다:

```ts
export interface ClipRange {
  startSeconds: number;
  endSeconds: number;
}
```

그리고 기존 mutation(save/applyStyle/confirm)과 동일 패턴으로 `addCustomMutation`을 추가하고 반환 객체에 노출한다(`ClipRange` 재사용):

```ts
  const addCustomMutation = useMutation({
    mutationFn: async (range: ClipRange) => {
      const result = await addCustomClipDraft({ uploadedFileId, ...range });
      if (!result.success) {
        throw new Error(result.error);
      }
    },
    onSuccess: async () => {
      await invalidateDetail();
      toast.success("Custom clip added");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to add clip",
      );
    },
  });

  return {
    // ... 기존 반환값 (transcriptWords, saveDraft, applyStyleToAll,
    //     confirmAndGenerate, selectAll/deselectAll, isSavingDraft,
    //     isApplyingToAll, isConfirming, isSettingSelection)
    addCustomClip: (range: ClipRange) => addCustomMutation.mutateAsync(range),
    isAddingCustom: addCustomMutation.isPending,
  };
```

import 추가: `addCustomClipDraft`(`~/fsd/features/clip-review`).

> 구현 노트: 이 훅의 반환 객체는 이 기능 이후 전체선택 작업(커밋 `00063e6`)으로 더 확장되었다.
> `selectAll`/`deselectAll`/`isSettingSelection`이 추가되고 `isSaving`은 `isSavingDraft`로
> 개명되었다(카드 로컬 저장 표시와 스코프를 구분하기 위함). 커스텀 구간 기능이 추가하는 것은
> `addCustomClip`과 `isAddingCustom` 두 개뿐이다.

**`src/fsd/widgets/clip-draft-review/ui/_component/AddCustomClipPanel.tsx` (신규)**

전사 단어를 클릭 가능한 span으로 렌더하고, 시작/종료 단어 클릭으로 구간을 잡는다. 동작 명세 + 참고 구현:

```tsx
"use client";

import { useMemo, useState } from "react";
import { cn } from "~/fsd/shared/lib/utils";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  CLIP_DURATION_LIMITS,
  isClipDurationWithinLimits,
} from "~/fsd/shared/config/constants";
import type {
  ClipRange,
  TranscriptWord,
} from "../../model/use-clip-draft-review";

interface AddCustomClipPanelProps {
  transcriptWords: TranscriptWord[];
  onAdd: (range: ClipRange) => Promise<void>;
  isAdding: boolean;
}

function getLengthLabel(
  range: { duration: number } | null,
  withinLimits: boolean,
): string {
  if (!range) return "No range selected";
  const base = `Length: ${range.duration.toFixed(1)}s`;
  if (withinLimits) return base;
  return `${base} (must be ${CLIP_DURATION_LIMITS.MIN_SECONDS}-${CLIP_DURATION_LIMITS.MAX_SECONDS}s)`;
}

export default function AddCustomClipPanel({
  transcriptWords,
  onAdd,
  isAdding,
}: AddCustomClipPanelProps) {
  const [open, setOpen] = useState(false);
  const [startIdx, setStartIdx] = useState<number | null>(null);
  const [endIdx, setEndIdx] = useState<number | null>(null);

  const range = useMemo(() => {
    if (startIdx === null || endIdx === null) return null;
    const lo = Math.min(startIdx, endIdx);
    const hi = Math.max(startIdx, endIdx);
    const start = transcriptWords[lo]?.start;
    const end = transcriptWords[hi]?.end;
    if (typeof start !== "number" || typeof end !== "number") return null;
    return { startSeconds: start, endSeconds: end, duration: end - start };
  }, [startIdx, endIdx, transcriptWords]);

  const withinLimits =
    !!range && isClipDurationWithinLimits(range.startSeconds, range.endSeconds);

  const handleWordClick = (idx: number) => {
    const isStartingNewSelection = startIdx === null || endIdx !== null;
    if (isStartingNewSelection) {
      setStartIdx(idx);
      setEndIdx(null);
      return;
    }
    setEndIdx(idx);
  };

  const handleAdd = async () => {
    if (!range || !withinLimits) return;
    try {
      await onAdd({
        startSeconds: range.startSeconds,
        endSeconds: range.endSeconds,
      });
      // 성공 시에만 초기화/닫기. 실패는 mutation onError 토스트로 노출되고,
      // 사용자가 다시 시도할 수 있도록 선택을 유지한다.
      setStartIdx(null);
      setEndIdx(null);
      setOpen(false);
    } catch {
      // onError가 이미 실패를 사용자에게 알렸다.
    }
  };

  if (transcriptWords.length === 0) {
    return null; // 전사 없음 → 폴백(숫자 입력)은 Open Questions
  }

  const selectedLo = startIdx === null ? null : Math.min(startIdx, endIdx ?? startIdx);
  const selectedHi = startIdx === null ? null : Math.max(startIdx, endIdx ?? startIdx);

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Add a clip AI missed</p>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Add custom clip"}
        </Button>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-muted-foreground text-xs">
            Click the first word, then the last word of the clip.
          </p>
          <div className="max-h-48 overflow-y-auto text-sm leading-relaxed">
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
          </div>

          <div className="flex items-center justify-between">
            <p
              className={cn(
                "text-xs",
                withinLimits ? "text-muted-foreground" : "text-destructive",
              )}
            >
              {getLengthLabel(range, withinLimits)}
            </p>
            <Button
              type="button"
              size="sm"
              disabled={!withinLimits || isAdding}
              onClick={handleAdd}
            >
              {isAdding ? "Adding..." : "Add clip"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

**`src/fsd/widgets/clip-draft-review/ui/index.tsx` — 패널 렌더**

`ClipDraftReviewSection`에서 훅 반환의 구조분해에 `addCustomClip`/`isAddingCustom`을 추가한다(같은 구조분해에 있는 나머지 키들은 이 기능과 무관하게 존재한다):

```tsx
  const {
    transcriptWords,
    saveDraft,
    applyStyleToAll,
    confirmAndGenerate,
    addCustomClip,      // ← 추가
    selectAll,
    deselectAll,
    isConfirming,
    isApplyingToAll,
    isAddingCustom,     // ← 추가
    isSavingDraft,
    isSettingSelection,
  } = useClipDraftReview(uploadedFileId, clipDrafts);
```

패널은 카드 목록 컨테이너(`<div className="flex max-h-[560px] flex-col gap-4 overflow-y-auto">`)
**안쪽**, 전체선택 버튼 행과 첫 카드 사이에 렌더한다. 컨테이너 바깥이 아니라 안쪽에 두어야
목록과 함께 스크롤되며, 전체선택 행 아래에 두어 "선택 조작 → 후보 추가 → 카드 목록" 순서가 된다:

```tsx
        <div className="flex max-h-[560px] flex-col gap-4 overflow-y-auto">
          <div className="flex items-center justify-end gap-2">
            {/* ... 기존 Select all / Deselect all (변경 없음) */}
          </div>
          <AddCustomClipPanel
            transcriptWords={transcriptWords}
            onAdd={addCustomClip}
            isAdding={isAddingCustom}
          />
          {clipDrafts.map((draft) => (
            // ... 기존 ClipDraftCard (변경 없음)
          ))}
        </div>
```

import 추가: `import AddCustomClipPanel from "./_component/AddCustomClipPanel";`

### 변경하지 않는 것 (근거)

- **백엔드 `main.py`**: 렌더 분기는 전달된 moment를 그대로 렌더하고 `type`/`hook`/`payoff`를 `.get()`으로 읽어 `None` 안전. 커스텀 구간(메타데이터 없음)도 그대로 렌더된다.
- **`getSelectedRenderMomentsForAttempt`**(clip-draft 엔티티): 선택된 모든 draft를 매핑하고 `index`를 순서로 재부여하므로 커스텀 draft도 그대로 포함된다. 무변경.
- **`confirmClipDraftsAndGenerate`**(upload 피처, :432/:451-452/:457): 선택된 모든 draft에 개수·겹침·30~90초 검증을 이미 적용한다. 커스텀 draft가 자동으로 대상이 되므로 무변경.
- **Prisma 스키마**: `ClipDraft`가 이미 사용자 편집 구조(aiStart/aiEnd/start/end/selected/captionStyle)라 컬럼 추가 불필요. 마이그레이션 없음.

---

## 5. 실행 순서

세 Phase 모두 커밋 `8ab82e5`에서 완료되었다(별도 커밋으로 쪼개지 않고 한 번에 출하).

### Phase 1: 엔티티 — 커스텀 draft 생성 ✅

- 작업: `entities/clip-draft/api`에 `createCustomClipDraft` 추가 + 배럴 export.
- 검증: `npm run check`. Prisma Studio(`npm run db:studio`)에서 함수 호출로 `attempt`/고유 `index`/`aiStart==start`/`selected==true` row 생성 확인.

### Phase 2: 피처 — 스키마 + 서버 액션 ✅

- 작업: `features/clip-review/model/schemas`에 `addCustomClipDraftSchema`, `features/clip-review/api`에 `addCustomClipDraft`, 배럴 export.
- 검증: `npm run check`. 30초 미만/90초 초과 입력 거부, 비-review_pending 업로드 거부, 타 사용자 소유 업로드 거부 동작 확인.

### Phase 3: 위젯 — 훅 mutation + 패널 UI + 통합 ✅

- 작업: `use-clip-draft-review`에 `addCustomClip`/`isAddingCustom`, 신규 `AddCustomClipPanel`, `ui/index.tsx`에 패널 렌더.
- 검증: 수동 E2E(8. 검증 전략).

---

## 6. 영향 범위

- **직접 수정 대상**:
  - 신규: `widgets/clip-draft-review/ui/_component/AddCustomClipPanel.tsx`
  - 수정: `entities/clip-draft/{api/index.ts, index.ts(배럴)}`, `features/clip-review/{api/index.ts, model/schemas.ts, index.ts(배럴)}`, `widgets/clip-draft-review/{model/use-clip-draft-review.ts, ui/index.tsx}`
- **import 변경 필요**: clip-review api(clip-draft 신규 함수), 위젯 훅(clip-review 신규 액션), 위젯 index(패널), 배럴 2개.
- **외부 의존성**: 신규 패키지 없음. 기존 Prisma/TanStack Query/서버 액션 스택 그대로.
- **소비자/사용처 영향**: `getUploadedFileDetailsById`는 `reviewAttempt`로 clipDraft를 로드하므로 커스텀 draft(같은 attempt)가 자연히 포함된다. `getSelectedRenderMomentsForAttempt`·`confirmClipDraftsAndGenerate`는 선택된 draft 전체를 다루므로 커스텀 포함이 자동. 백엔드/디스패처/스키마 무변경 → 하위 호환에 영향 없음.

---

## 7. 리스크 + 롤백 전략

### 리스크

1. **index 충돌 레이스** (가능성 저, 영향 저): 같은 attempt에 커스텀 추가가 동시에 두 번 일어나면 두 트랜잭션이 같은 `max(index)+1`을 읽어 `@@unique([uploadedFileId, attempt, index])` 위반(P2002)이 날 수 있다. 완화: 검토 UI는 단일 사용자·순차 조작이라 발생 확률이 낮다. 필요 시 액션에서 P2002를 잡아 1회 재시도(재-aggregate)하는 방어를 추가한다(Open Questions).
2. **커스텀-AI 구간 겹침** (가능성 중, 영향 저): 사용자가 AI 후보와 겹치는 구간을 추가할 수 있다. 확정 시 기존 겹침 검증이 막으므로 데이터 손상은 없다. 다만 "추가 시점"이 아니라 "확정 시점"에 거부되어 UX가 늦다 — 추가 시점 겹침 경고는 Open Questions. (출하 후 확인: 위젯의 `hasOverlap` 미러가 Generate 버튼을 미리 비활성화하므로 실제 지연은 제안 당시 예상보다 짧다.)
3. **targetClipCount 한도** (가능성 중, 영향 저): 커스텀을 추가해 선택 수가 `targetClipCount`를 넘으면 확정이 거부된다("You can generate up to N clips"). 정책 판단 필요(Open Questions).
4. **긴 전사 렌더 비용** (가능성 저, 영향 저): 수천 단어 전사를 모두 span으로 렌더하면 무거울 수 있다. v1은 `max-h-48 overflow-y-auto`로 스크롤 처리, 가상화는 후속.

### 롤백 전략

- 전부 additive이며 스키마 변경이 없다. 위젯에서 `AddCustomClipPanel` 렌더만 제거(또는 숨김)하면 기능이 비활성화되고, 신규 엔티티/피처 함수는 미사용 상태로 무해하게 남는다. DB 정리 불필요.

---

## 8. 검증 전략

### 검증 현황 (2026-07-28)

- **타입/빌드**: `npm run check` 실행 → ESLint 경고·오류 0건, `tsc --noEmit` 오류 없음. ✅
- **코드 대조**: §4 신규 1 + 수정 7 표면을 전수 대조 완료(샘플링 아님). ✅
- **수동 E2E 시나리오 1~6**: 이 문서 갱신 시점에 재실행하지 않았다. 최초 출하(`8ab82e5`) 시의 확인 결과에 의존하며, 검토 플로우를 다시 손댈 때는 아래 시나리오를 재실행할 것.

### 계획 (원안)

- **기존 테스트**: 저장소에 자동화 테스트 프레임워크/컨벤션이 관찰되지 않았다(`npm run check`/`typecheck`/`lint`가 품질 게이트, frontend CLAUDE.md). 새 단위 테스트를 성공 기준으로 명시하지 않는다(Open Questions).
- **타입/빌드 검증**: 각 Phase 후 `npm run check`.
- **수동 확인 시나리오** (dev 서버 + `npm run inngest-dev`, 검토 모드 업로드가 `review_pending`에 도달한 상태에서):
  1. "Add custom clip" → 전사에서 시작/종료 단어 클릭 → 길이 표시/검증 확인 → "Add clip" → 새 카드가 목록에 나타남.
  2. 30초 미만/90초 초과 구간 선택 → "Add clip" 비활성/거부 확인.
  3. 추가한 커스텀 카드에서 시작/종료·캡션 스타일 편집·Save가 AI 카드와 동일하게 동작.
  4. 커스텀 클립 선택 후 확정 → 해당 구간이 실제 클립으로 생성되고 `Clip.startSeconds`/`endSeconds`가 커스텀 값과 일치.
  5. 커스텀이 AI 후보와 겹치도록 선택 후 확정 → "Selected clips must not overlap" 거부.
  6. 선택 수가 `targetClipCount`를 넘도록 커스텀 추가 후 확정 → "You can generate up to N clips" 거부.

---

<!-- doc-validation-skip -->
## Open Questions — 출하 시점 결정 (2026-07-28 확인)

### 결정됨

- **[구간 선택 UX]** → **폴백 없음으로 확정**. 전사가 비어 있으면 `AddCustomClipPanel`이 `null`을 반환해 커스텀 추가가 비활성된다. 숫자 입력 폴백은 만들지 않았다(근거는 §3 "선택"). 되살리려면 `AddCustomClipPanel`의 early-return 지점 하나만 바꾸면 된다.

### 의도적으로 미구현 (현행 유지)

아래 3건은 제안 당시 판단대로 손대지 않은 채 출하되었다. 코드에 대응 구현이 없다는 사실 자체가 결정이며, 재검토 시 아래 진입점부터 보면 된다.

- **[겹침 검증 시점]** 추가 시점 겹침 경고는 **없다**. 커스텀이 기존 선택 draft와 겹쳐도 추가는 성공하고, `confirmClipDraftsAndGenerate`(`features/upload/api/index.ts:451-452`)의 "Selected clips must not overlap"에서 막힌다. 다만 위젯의 `hasOverlap` 미러(`widgets/clip-draft-review/ui/index.tsx`)가 Generate 버튼 단계에서 사전 차단하므로, 실제 사용자 체감 지연은 "확정 클릭"이 아니라 "추가 직후 Generate 비활성"까지다. 추가 시점 경고를 넣는다면 `AddCustomClipPanel`이 선택된 draft 범위를 prop으로 받아야 한다.
- **[targetClipCount 정책]** 커스텀도 기존 한도를 **공유**한다(별도 상한 없음). 초과 시 확정에서 "You can generate up to N clips"(`:432`)로 거부. 비즈니스 판단이 바뀌면 이 가드와 위젯 `getGenerateBlockReason`을 함께 고쳐야 한다.
- **[index 레이스 하드닝]** `addCustomClipDraft` 액션에 **P2002 캐치/재시도 없음**. 동시 추가 시 "Failed to add clip" 토스트로 노출되고 사용자가 재시도하면 해소된다. 단일 사용자·순차 조작 UI라 유예.

### 남은 과제

- **[검증 커버리지]** 저장소에 테스트 프레임워크가 여전히 없다. `createCustomClipDraft`의 index 부여와 `addCustomClipDraftSchema`의 30~90초 검증은 순수 로직에 가까워, 테스트 도입 시 우선 대상.

<!-- doc-validation-restore -->
