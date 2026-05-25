"use server";

import { redirect } from "next/navigation";
import {
  listRecoverableUploadDraftsByUserId,
  listUploadedFileSummariesByUserId,
} from "~/fsd/entities/uploaded-file";
import DashboardView from "~/fsd/pages/dashboard/ui";
import { auth } from "~/server/auth";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

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
