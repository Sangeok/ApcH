"use server";

import { redirect } from "next/navigation";
import DashboardClient from "~/fsd/pages/dashboard/ui";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  await new Promise((resolve) => setTimeout(resolve, 5000));

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
          s3Key: true,
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
      clips: {
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  const formattedFiles = userData.uploadedFiles.map((file) => ({
    id: file.id,
    s3Key: file.s3Key,
    fileName: file.displayName ?? "Untitled",
    status: file.status,
    clipsCount: file._count.clips,
    createdAt: file.createdAt,
  }));

  return (
    <DashboardClient uploadedFiles={formattedFiles} clips={userData.clips} />
  );
}
