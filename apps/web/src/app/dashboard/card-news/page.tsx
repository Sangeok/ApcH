import { redirect } from "next/navigation";
import { listCardNews } from "~/fsd/features/card-news";
import { CardNewsListPage } from "~/fsd/pages/card-news-list";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ clipId?: string }>;
}) {
  const { clipId } = await searchParams;
  const result = await listCardNews(clipId ? { clipId } : {});
  if (!result.success) {
    if (result.error === "Unauthorized") redirect("/login");
    throw new Error(result.error);
  }
  return (
    <CardNewsListPage
      key={result.data.authUserId}
      userId={result.data.authUserId}
      initialSets={result.data.sets}
      clipId={clipId}
    />
  );
}
