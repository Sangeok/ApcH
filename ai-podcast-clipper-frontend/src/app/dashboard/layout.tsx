"use server";

import { redirect } from "next/navigation";
import { Toaster } from "~/fsd/shared/ui/atoms/sonner";
import NavHeader from "~/fsd/widgets/nav-header/ui";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await db.user.findUniqueOrThrow({
    where: {
      id: session.user.id,
    },
    select: {
      email: true,
      credits: true,
    },
  });

  return (
    <div className="flex min-h-screen flex-col">
      <NavHeader email={user.email} credits={user.credits} />
      <main className="container mx-auto flex-1 py-6">{children}</main>
      <Toaster />
    </div>
  );
}
