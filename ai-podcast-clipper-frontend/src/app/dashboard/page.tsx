"use server";

import { redirect } from "next/navigation";
import DashboardView from "~/fsd/pages/dashboard/ui";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import type { ProcessingStatus } from "~/fsd/shared/types/processing-status";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const userData = await db.user.findUniqueOrThrow({
    where: {
      id: session.user.id,
    },
    select: {
      uploadedFiles: {
        where: {
          uploaded: true,
        },
        select: {
          id: true,
          displayName: true,
          status: true,
          createdAt: true,
          _count: {
            select: {
              clips: true,
            },
          },
        },
      },
    },
  });

  const formattedFiles = userData.uploadedFiles.map((file) => ({
    id: file.id,
    fileName: file.displayName ?? "Untitled",
    status: file.status as ProcessingStatus,
    clipsCount: file._count.clips,
    createdAt: file.createdAt,
  }));

  return <DashboardView uploadedFiles={formattedFiles} />;
}
