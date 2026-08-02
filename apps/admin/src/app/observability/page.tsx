import type { Metadata } from "next";

import { requireAdmin } from "~/auth/guard";
import { AdminHeader } from "~/ui/admin-header";
import { ObservabilityTestPanel } from "~/ui/observability-panel";

export const metadata: Metadata = {
  title: "Admin Observability",
  robots: { index: false, follow: false },
};

export default async function AdminObservabilityRoute() {
  const admin = await requireAdmin();

  return (
    <>
      <AdminHeader email={admin.email} />
      <main>
        <ObservabilityTestPanel />
      </main>
    </>
  );
}
