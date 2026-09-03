import { redirect } from "next/navigation";
import {
  listActiveUploadedFileQueueStateByUserId,
  listRecoverableUploadDraftsByUserId,
  listUploadedFileSummariesByUserId,
  reconcileUploadDraftsForUser,
} from "~/fsd/entities/uploaded-file/server";
import { reconcileStaleUploadedFilesForUser } from "~/fsd/features/upload/api/reconcile-stale-processing";
import DashboardView from "~/fsd/pages/dashboard/ui";
import { auth } from "~/server/auth";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  await reconcileStaleUploadedFilesForUser(session.user.id);
  await reconcileUploadDraftsForUser(session.user.id);

  // 큐 상태를 여기서 함께 읽는다. 이전에는 클라이언트가 uploadedFiles에서
  // 서버와 같은 형태를 재구성했는데(같은 status 필터 + 하드코딩된 25),
  // 그 두 벌이 어긋나면 첫 화면과 첫 refetch의 큐가 달라진다.
  const [uploadedFiles, recoverableDrafts, activeQueue] = await Promise.all([
    listUploadedFileSummariesByUserId(session.user.id),
    listRecoverableUploadDraftsByUserId(session.user.id),
    listActiveUploadedFileQueueStateByUserId(session.user.id),
  ]);

  return (
    <DashboardView
      userId={session.user.id}
      uploadedFiles={uploadedFiles}
      recoverableDrafts={recoverableDrafts}
      initialActiveQueue={activeQueue}
    />
  );
}
