import { redirect } from "next/navigation";
import {
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

  const [uploadedFiles, recoverableDrafts] = await Promise.all([
    listUploadedFileSummariesByUserId(session.user.id),
    listRecoverableUploadDraftsByUserId(session.user.id),
  ]);

  return (
    <DashboardView
      userId={session.user.id}
      uploadedFiles={uploadedFiles}
      recoverableDrafts={recoverableDrafts}
    />
  );
}
