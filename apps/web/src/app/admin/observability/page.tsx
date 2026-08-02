import type { Metadata } from "next";
import { ObservabilityTestPanel } from "~/fsd/pages/admin-observability/ui";
import { requireAdmin } from "~/fsd/shared/api/admin-guard";

export const metadata: Metadata = {
  title: "Admin Observability",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminObservabilityRoute() {
  await requireAdmin();

  return <ObservabilityTestPanel />;
}
