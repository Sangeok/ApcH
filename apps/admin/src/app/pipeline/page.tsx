import type { Metadata } from "next";

import { requireAdmin } from "~/auth/guard";
import { getPipelineBoard } from "~/pipeline/queries";
import { AdminHeader } from "~/ui/admin-header";
import { PipelineBoard } from "~/ui/pipeline-page";

export const metadata: Metadata = {
  title: "Admin Pipeline",
  robots: { index: false, follow: false },
};

// 매 요청 dev 브랜치 보드를 다시 읽는 투영이므로 정적화하지 않는다.
export const dynamic = "force-dynamic";

export default async function AdminPipelineRoute() {
  const admin = await requireAdmin();
  const sections = await getPipelineBoard();

  return (
    <>
      <AdminHeader email={admin.email} />
      <main>
        <PipelineBoard sections={sections} />
      </main>
    </>
  );
}
