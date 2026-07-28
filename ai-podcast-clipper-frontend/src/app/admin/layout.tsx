import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "~/fsd/shared/api/admin-guard";
import { Button } from "~/fsd/shared/ui/atoms/button";
import { Toaster } from "~/fsd/shared/ui/atoms/sonner";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-sm text-muted-foreground">Admin</p>
            <p className="font-medium">{admin.email}</p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </div>
      </header>
      <main>{children}</main>
      <Toaster />
    </div>
  );
}
