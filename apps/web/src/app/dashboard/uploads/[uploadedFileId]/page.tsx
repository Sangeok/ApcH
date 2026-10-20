import { notFound, redirect } from "next/navigation";
import { requireAuth } from "~/fsd/shared/api/auth-guard";
import { reconcileAndGetUploadedFileDetails } from "~/fsd/features/upload";
import UploadDetailPage from "~/fsd/pages/upload-detail/ui";
import { getCardNewsCreationContext } from "~/fsd/features/card-news";

interface UploadDetailPageProps {
  params: Promise<{ uploadedFileId: string }>;
}

export default async function UploadDetailPageClient({
  params,
}: UploadDetailPageProps) {
  const { uploadedFileId } = await params;
  const authentication = await requireAuth();
  if (!authentication.success) redirect("/login");
  const uploadedFileData =
    await reconcileAndGetUploadedFileDetails(uploadedFileId);

  if (!uploadedFileData) {
    notFound();
  }

  const cardNews = await getCardNewsCreationContext();
  return (
    <UploadDetailPage
      userId={authentication.data.userId}
      uploadedFileData={uploadedFileData}
      cardNewsContext={cardNews.success ? cardNews.data : undefined}
    />
  );
}
