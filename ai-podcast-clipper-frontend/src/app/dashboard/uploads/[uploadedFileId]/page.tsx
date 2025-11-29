import { notFound } from "next/navigation";
import { getUploadedFileDetails } from "~/actions/uploaded-files";
import UploadDetailPage from "~/fsd/pages/uploadDetail/ui";

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

  return <UploadDetailPage uploadedFileData={uploadedFileData} />;
}
