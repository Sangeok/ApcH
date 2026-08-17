import type { Metadata } from "next";

import { ObservabilityTestPanel } from "~/fsd/features/send-observability-test";
import { requireAdmin } from "~/server/auth/guard";

export const metadata: Metadata = {
  title: "Admin Observability",
  robots: { index: false, follow: false },
};

export default async function AdminObservabilityRoute() {
  await requireAdmin();

  return (
    <main>
      <ObservabilityTestPanel />
    </main>
  );
}
