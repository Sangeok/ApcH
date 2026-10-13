import { notFound, redirect } from "next/navigation";
import {
  getCardNewsDetail,
  getCardNewsCreationContext,
} from "~/fsd/features/card-news";
import { CardNewsDetailPage } from "~/fsd/pages/card-news-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ cardNewsId: string }>;
}) {
  const { cardNewsId } = await params;
  const result = await getCardNewsDetail({ setId: cardNewsId });
  if (!result.success) {
    if (result.error === "Unauthorized") redirect("/login");
    if (result.error === "Card news not found") notFound();
    throw new Error(result.error);
  }
  const context = await getCardNewsCreationContext();
  if (!context.success || context.data.userId !== result.data.authUserId)
    redirect("/login");
  return (
    <CardNewsDetailPage
      userId={result.data.authUserId}
      detail={result.data.detail}
      generationEnabled={context.data.enabled}
      initialCreditBalance={context.data.creditBalance}
    />
  );
}
