"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ClipDraft } from "@repo/db";
import {
  type UploadedFileDetail,
  uploadedFileKeys,
} from "~/fsd/entities/uploaded-file";
import {
  addCustomClipDraft,
  getTranscriptUrl,
  saveClipDraftEdit,
  type CaptionStyleInput,
} from "~/fsd/features/clip-review";
import { confirmClipDraftsAndGenerate } from "~/fsd/features/upload";
import { trackAnalyticsEvent } from "~/fsd/shared/analytics";
import { matchPresetId } from "./caption-presets";

// 검토 계측이 쓰는 정규화된 경로. normalizeAnalyticsPath가 실제 URL을 이 형태로
// 접으므로(shared/analytics/lib/normalize-path.ts) 기존 upload_detail_viewed
// 호출부와 동일한 문자열을 쓴다. 훅과 위젯이 같은 값을 쓰도록 여기서 export한다.
export const REVIEW_ANALYTICS_PATH = "/dashboard/uploads/[uploadedFileId]";

// 전사 JSON의 단어 단위 형태 (백엔드 transcribe_video 반환 형식, main.py).
// 카드·에디터가 동일 타입을 소비하도록 위젯 model에서 단일 정의·export한다.
export interface TranscriptWord {
  start: number;
  end: number;
  word: string;
}

export interface SaveDraftInput {
  clipDraftId: string;
  startSeconds: number;
  endSeconds: number;
  selected: boolean;
  // undefined = 스타일 변경 없음, null = 기본 스타일로 리셋
  captionStyle?: CaptionStyleInput | null;
}

// 커스텀 구간 입력의 단일 타입. 위젯 계층 3곳(mutationFn 인자, addCustomClip 반환,
// 패널 onAdd prop)이 공유한다. 하위 계층(entity/feature)으로는 내려보내지 않는다(FSD).
export interface ClipRange {
  startSeconds: number;
  endSeconds: number;
}

export function useClipDraftReview(
  uploadedFileId: string,
  clipDrafts: ClipDraft[],
  // 계측 메타데이터 산정용. 뮤테이션 성공 지점에서 예산 값을 함께 실어
  // 보내기 위해 받는다. 선택 동작 자체는 이 값에 의존하지 않는다.
  budgetContext: { targetClipCount: number },
) {
  const queryClient = useQueryClient();

  const detailKey = uploadedFileKeys.detail(uploadedFileId);

  const invalidateDetail = () =>
    queryClient.invalidateQueries({ queryKey: detailKey });

  // 키는 detail() 아래에 중첩한다. 위젯 이름으로 시작하는 인라인 키였을 때는
  // 이 캐시를 무효화할 수 있는 모듈이 없어서, 재분석이 새 transcriptS3Key를 써도
  // 세션 내내 이전 시도의 트랜스크립트로 단어 경계를 스냅했다.
  const {
    data: transcriptWords = [],
    isError: isTranscriptError,
    error: transcriptError,
  } = useQuery<TranscriptWord[]>({
    queryKey: uploadedFileKeys.transcript(uploadedFileId),
    staleTime: Infinity,
    // 실패를 빈 배열로 접지 않는다. 접으면 isError가 영구 false라 presign 만료나
    // S3 403이 "단어 스냅이 조용히 꺼진 화면"으로만 나타난다(규약 §10).
    queryFn: async () => {
      const result = await getTranscriptUrl(uploadedFileId);
      if (!result.success) {
        throw new Error(result.error);
      }

      const response = await fetch(result.data.url);
      if (!response.ok) {
        throw new Error(`Transcript fetch failed: ${response.status}`);
      }

      const parsed = (await response.json()) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error("Transcript payload was not an array");
      }

      return parsed.filter(
        (word): word is TranscriptWord =>
          typeof word === "object" &&
          word !== null &&
          typeof (word as TranscriptWord).start === "number" &&
          typeof (word as TranscriptWord).end === "number" &&
          typeof (word as TranscriptWord).word === "string",
      );
    },
  });

  // 선택 변경 계측. 두 경로(카드 체크박스, Fill/Clear)가 같은 페이로드를 쓰도록
  // 한 번만 정의한다.
  // ⚠️ invalidate 직후라 clipDrafts prop이 아직 이전 값일 수 있다. 추세 파악
  //    목적에는 충분하다고 보고 1차에서는 이 단순한 형태를 쓴다.
  const trackSelectionChanged = () => {
    const selectedCount = clipDrafts.filter((draft) => draft.selected).length;
    void trackAnalyticsEvent(
      "clip_review_selection_changed",
      {
        uploadedFileId,
        selectedCount,
        isFull: selectedCount >= budgetContext.targetClipCount,
      },
      { path: REVIEW_ANALYTICS_PATH },
    );
  };

  // 캡션 스타일 계측. 카드는 저장 성공을 관찰하지 못하므로(runSave가 에러를
  // 삼킨다) 다른 검토 이벤트와 같이 훅에서 발화한다.
  const trackCaptionStyleEdited = (
    style: CaptionStyleInput | null,
    appliedToAll: boolean,
  ) => {
    void trackAnalyticsEvent(
      "clip_review_caption_style_edited",
      { uploadedFileId, preset: matchPresetId(style), appliedToAll },
      { path: REVIEW_ANALYTICS_PATH },
    );
  };

  const saveMutation = useMutation({
    mutationFn: async (input: SaveDraftInput) => {
      const result = await saveClipDraftEdit(input);
      if (!result.success) {
        throw new Error(result.error);
      }
    },
    // 구간 자동 저장은 captionStyle을 싣지 않는다(ClipDraftCard). 이 조건이
    // 다이얼로그 Apply만 정확히 골라낸다 — null도 "기본값으로 리셋"이라 계측한다.
    onSuccess: (_data, input) => {
      if (input.captionStyle === undefined) return;
      trackCaptionStyleEdited(input.captionStyle, false);
    },
    // 낙관적 갱신: 헤더 선택 개수와 Generate 가드가 서버 왕복 없이 즉시
    // 일치하도록 detail 캐시의 해당 draft를 먼저 바꾼다. 실패 시 롤백.
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<UploadedFileDetail>(detailKey);
      // 이 뮤테이션은 구간·캡션 자동 저장에도 쓰인다. 선택이 실제로 바뀐
      // 경우에만 계측하려고 이전 값과 대조해 context로 넘긴다.
      const previousDraft = previous?.clipDrafts.find(
        (draft) => draft.id === input.clipDraftId,
      );
      const selectionChanged =
        previousDraft !== undefined &&
        previousDraft.selected !== input.selected;

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

      return { previous, selectionChanged };
    },
    onError: (error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(detailKey, context.previous);
      }
      toast.error(
        error instanceof Error ? error.message : "Failed to save clip",
      );
    },
    onSettled: async (_data, _error, _input, context) => {
      await invalidateDetail();
      if (!context?.selectionChanged) {
        return;
      }
      trackSelectionChanged();
    },
  });

  // "Apply to all"의 벌크 저장은 draft 컬렉션을 아는 이 훅이 소유한다.
  // CaptionStyleEditor는 onApplyToAll(style) 콜백만 호출한다.
  const applyStyleMutation = useMutation({
    mutationFn: async (style: CaptionStyleInput | null) => {
      for (const draft of clipDrafts) {
        const result = await saveClipDraftEdit({
          clipDraftId: draft.id,
          startSeconds: draft.startSeconds,
          endSeconds: draft.endSeconds,
          selected: draft.selected,
          captionStyle: style,
        });
        if (!result.success) {
          throw new Error(result.error);
        }
      }
    },
    onSuccess: async (_data, style) => {
      await invalidateDetail();
      trackCaptionStyleEdited(style, true);
      toast.success("Applied caption style to all clips");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to apply style",
      );
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const result = await confirmClipDraftsAndGenerate(uploadedFileId);
      if (!result.success) {
        throw new Error(result.error);
      }
    },
    onSuccess: async () => {
      await invalidateDetail();
      void trackAnalyticsEvent(
        "clip_review_confirmed",
        {
          uploadedFileId,
          selectedCount: clipDrafts.filter((draft) => draft.selected).length,
          budgetLimit: budgetContext.targetClipCount,
        },
        { path: REVIEW_ANALYTICS_PATH },
      );
      toast.success("Clip generation started");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to start generation",
      );
    },
  });

  const addCustomMutation = useMutation({
    mutationFn: async (range: ClipRange) => {
      const result = await addCustomClipDraft({ uploadedFileId, ...range });
      if (!result.success) {
        throw new Error(result.error);
      }
    },
    onSuccess: async () => {
      await invalidateDetail();
      void trackAnalyticsEvent(
        "clip_review_custom_clip_added",
        { uploadedFileId },
        { path: REVIEW_ANALYTICS_PATH },
      );
      toast.success("Custom clip added");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to add clip",
      );
    },
  });

  // 전체 선택/해제. applyStyleMutation과 같은 순차 루프 패턴을 따르되,
  // 단일 카드 토글(saveMutation)과 동일하게 낙관적 갱신으로 헤더 카운트를
  // 즉시 일치시킨다. 일부만 성공한 채 실패할 수 있으므로 onSettled에서
  // 성공/실패 모두 서버 상태로 재동기화한다.
  const setSelectionMutation = useMutation({
    mutationFn: async (selectedIds: Set<string>) => {
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
    // Fill/Clear는 대상 전체를 다시 쓰므로 항상 선택 변경이다.
    onSettled: async () => {
      await invalidateDetail();
      trackSelectionChanged();
    },
    onError: (error, _selectedIds, context) => {
      if (context?.previous) {
        queryClient.setQueryData(detailKey, context.previous);
      }
      toast.error(
        error instanceof Error ? error.message : "Failed to update selection",
      );
    },
  });

  return {
    transcriptWords,
    // 트랜스크립트 실패는 기능 하나(직접 클립 추가)를 통째로 없애므로
    // 소비자가 안내를 띄울 수 있도록 드러낸다.
    transcriptErrorMessage: isTranscriptError
      ? transcriptError instanceof Error
        ? transcriptError.message
        : "Transcript unavailable"
      : null,
    saveDraft: (input: SaveDraftInput) => saveMutation.mutateAsync(input),
    // 아래 넷은 JSX가 프라미스를 버리는 fire-and-forget 호출처다. mutateAsync는
    // mutationFn이 던지면 reject하는데 호출처가 받지 않아 unhandled rejection이 됐다
    // (onError 토스트는 버려진 프라미스를 settle하지 않는다). mutate로 바꾼다.
    applyStyleToAll: (style: CaptionStyleInput | null) => {
      applyStyleMutation.mutate(style);
    },
    confirmAndGenerate: () => {
      confirmMutation.mutate();
    },
    addCustomClip: (range: ClipRange) => addCustomMutation.mutateAsync(range),
    // 의도가 이름에 드러나도록 boolean 파라미터 대신 두 액션으로 노출한다.
    // clipDrafts는 Gemini 랭킹 순으로 정렬되어 온다
    // (index = moment.index ?? order, inngest/functions.ts →
    //  clip-draft/api/index.ts의 orderBy index asc).
    // 따라서 slice(0, limit)은 "상위 N개"가 맞다. 시간순이 아니다.
    selectUpToBudget: (limit: number) => {
      setSelectionMutation.mutate(
        new Set(clipDrafts.slice(0, limit).map((draft) => draft.id)),
      );
    },
    deselectAll: () => {
      setSelectionMutation.mutate(new Set<string>());
    },
    // 위젯(확정 다이얼로그)이 소비하는 공유 플래그. 카드 로컬 isSaving
    // (개별 카드 저장 표시)과 스코프가 다르므로 이름으로 구분한다.
    isSavingDraft: saveMutation.isPending,
    isApplyingToAll: applyStyleMutation.isPending,
    isConfirming: confirmMutation.isPending,
    isAddingCustom: addCustomMutation.isPending,
    isSettingSelection: setSelectionMutation.isPending,
  };
}
