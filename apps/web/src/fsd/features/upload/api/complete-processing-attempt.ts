import "server-only";

import { decrementUserCreditsFloorZero } from "~/fsd/entities/user/server";
import { markUploadedFileAttemptProcessed } from "~/fsd/entities/uploaded-file/server";
import { db } from "~/server/db";

/**
 * 처리 시도 완료 = UploadedFile 상태 전이 + User 크레딧 차감. 두 엔티티에 걸친
 * 오케스트레이션이라 어느 한쪽 엔티티가 소유하면 peer 임포트가 된다
 * (`fsd-architecture-guidelines.md` §5.2, "상위 레이어의 api/는 오케스트레이션 전용" §3).
 *
 * `"use server"`를 **붙이지 않는다.** 이 디렉터리의 `index.ts`만 서버 액션 모듈이고,
 * 여기에 지시어를 넣으면 이 함수가 클라이언트 호출 가능한 RPC 엔드포인트가 된다.
 */
export async function completeUploadedFileProcessingAttempt(args: {
  uploadedFileId: string;
  attempt: number;
  userId: string;
  clipsFound: number;
  noteCode?: string | null;
  now?: Date;
}): Promise<{ completed: boolean }> {
  return db.$transaction(async (tx) => {
    const updated = await markUploadedFileAttemptProcessed(
      args.uploadedFileId,
      args.attempt,
      {
        tx,
        now: args.now,
        noteCode: args.noteCode,
      },
    );

    if (updated.count !== 1) {
      return { completed: false };
    }

    await decrementUserCreditsFloorZero(args.userId, args.clipsFound, { tx });
    return { completed: true };
  });
}
