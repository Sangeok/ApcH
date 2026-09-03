import { notFound } from "next/navigation";
import { reconcileAndGetUploadedFileDetails } from "~/fsd/features/upload";
import UploadDetailPage from "~/fsd/pages/upload-detail/ui";

interface UploadDetailPageProps {
  params: Promise<{ uploadedFileId: string }>;
}

export default async function UploadDetailPageClient({
  params,
}: UploadDetailPageProps) {
  const { uploadedFileId } = await params;
  const uploadedFileData = await reconcileAndGetUploadedFileDetails(uploadedFileId);

  if (!uploadedFileData) {
    notFound();
  }

  return <UploadDetailPage uploadedFileData={uploadedFileData} />;
}
