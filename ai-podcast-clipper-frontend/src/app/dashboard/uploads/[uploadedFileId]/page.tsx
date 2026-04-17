import { notFound } from "next/navigation";
import type { ProcessingStatus } from "~/fsd/entities/uploaded-file";
import { getUploadedFileDetails } from "~/fsd/features/upload/api";
import UploadDetailPage from "~/fsd/pages/upload-detail/ui";

interface UploadDetailPageProps {
  params: Promise<{ uploadedFileId: string }>;
}

export default async function UploadDetailPageClient({
  params,
}: UploadDetailPageProps) {
  const { uploadedFileId } = await params;
  const uploadedFileData = await getUploadedFileDetails(uploadedFileId);

  if (!uploadedFileData) {
    notFound();
  }

  return (
    <UploadDetailPage
      uploadedFileData={{
        ...uploadedFileData,
        status: uploadedFileData.status as ProcessingStatus,
      }}
    />
  );
}
