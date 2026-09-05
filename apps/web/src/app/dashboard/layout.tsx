import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { getDashboardHeaderUser } from "~/fsd/entities/user/server";
import { Toaster } from "~/fsd/shared/ui/atoms/sonner";
import { DashboardHeader } from "~/fsd/widgets/dashboard-header";
import { auth } from "~/server/auth";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await getDashboardHeaderUser(session.user.id);

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        email={user.email}
        credits={user.credits}
        image={user.image}
      />
      <main className="container mx-auto flex-1 py-6">{children}</main>
      <Toaster />
    </div>
  );
}
