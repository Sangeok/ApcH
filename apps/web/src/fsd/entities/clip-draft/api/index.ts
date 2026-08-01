import "server-only";

// Prisma.JsonNull 값을 쓰므로 type-only import가 아니어야 한다.
import { Prisma } from "generated/prisma";
import { db } from "~/server/db";
import type { CaptionStyle } from "~/fsd/shared/config/constants";

type DbClient = Prisma.TransactionClient | typeof db;

function getClient(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? db;
}

// Persists AI-proposed clip drafts for an analysis attempt.
// Duplicate (uploadedFileId, attempt, index) rows are ignored for retry idempotency.
export async function createClipDraftsBulk(
  data: Prisma.ClipDraftCreateManyInput[],
  options?: { tx?: Prisma.TransactionClient },
) {
  if (data.length === 0) {
    return { count: 0 };
  }

  return getClient(options?.tx).clipDraft.createMany({
    data,
    skipDuplicates: true,
  });
}

export async function listClipDraftsForAttempt(
  uploadedFileId: string,
  attempt: number,
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).clipDraft.findMany({
    where: { uploadedFileId, attempt },
    orderBy: { index: "asc" },
  });
}

// Loads a draft together with its parent upload for ownership/state checks.
export async function findClipDraftWithUpload(
  clipDraftId: string,
  userId: string,
) {
  return db.clipDraft.findFirst({
    where: {
      id: clipDraftId,
      uploadedFile: { userId },
    },
    select: {
      id: true,
      attempt: true,
      aiStartSeconds: true,
      aiEndSeconds: true,
      uploadedFile: {
        select: {
          id: true,
          status: true,
          reviewAttempt: true,
        },
      },
    },
  });
}

export async function updateClipDraftEdit(
  clipDraftId: string,
  data: {
    startSeconds: number;
    endSeconds: number;
    selected: boolean;
    // undefined = 스타일 변경 없음, null = 기본 스타일로 리셋
    captionStyle?: Prisma.InputJsonValue | null;
  },
  options?: { tx?: Prisma.TransactionClient },
) {
  const { captionStyle, ...rest } = data;

  return getClient(options?.tx).clipDraft.update({
    where: { id: clipDraftId },
    data: {
      ...rest,
      ...(captionStyle !== undefined
        ? { captionStyle: captionStyle ?? Prisma.JsonNull }
        : {}),
    },
  });
}

// 렌더 디스패치용: 분석 attempt의 선택된 draft를 ProcessVideoRequest.moments
// 계약(caption_style는 백엔드 snake_case 키)으로 매핑한다. ClipDraft 컬럼 지식과
// 캡션 타입 해석은 이 엔티티가 소유하고, 디스패처는 결과 배열만 사용한다.
export async function getSelectedRenderMomentsForAttempt(
  uploadedFileId: string,
  attempt: number,
) {
  const drafts = await db.clipDraft.findMany({
    where: { uploadedFileId, attempt, selected: true },
    orderBy: { index: "asc" },
  });

  return drafts.map((draft, order) => ({
    index: order,
    start: draft.startSeconds,
    end: draft.endSeconds,
    type: draft.clipType,
    hook: draft.hook,
    payoff: draft.payoff,
    // 저장 시 captionStyleSchema(shared CaptionStyle)로 검증된 JSON.
    caption_style: (draft.captionStyle as CaptionStyle | null) ?? undefined,
  }));
}

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
