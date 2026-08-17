import type { ReactNode } from "react";

import { AdminHeader } from "~/fsd/widgets/admin-header";
import { requireAdmin } from "~/server/auth/guard";

export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <>
      <AdminHeader email={admin.email} />
      {children}
    </>
  );
}
