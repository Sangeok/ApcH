"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ClipDraft } from "generated/prisma";
import { uploadedFileKeys } from "~/fsd/entities/uploaded-file/model/query-keys";
import type { UploadedFileDetail } from "~/fsd/entities/uploaded-file/model/types";
import {
  addCustomClipDraft,
  getTranscriptUrl,
  saveClipDraftEdit,
  type CaptionStyleInput,
} from "~/fsd/features/clip-review";
import { confirmClipDraftsAndGenerate } from "~/fsd/features/upload/api";

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
) {
  const queryClient = useQueryClient();

  const detailKey = uploadedFileKeys.detail(uploadedFileId);

  const invalidateDetail = () =>
    queryClient.invalidateQueries({ queryKey: detailKey });

  const { data: transcriptWords = [] } = useQuery<TranscriptWord[]>({
    queryKey: ["clip-draft-review", "transcript", uploadedFileId],
    staleTime: Infinity,
    queryFn: async () => {
      const result = await getTranscriptUrl(uploadedFileId);
      if (!result.success) {
        return [];
      }

      const response = await fetch(result.data.url);
      if (!response.ok) {
        return [];
      }

      const parsed = (await response.json()) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
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
    onSuccess: async () => {
      await invalidateDetail();
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
