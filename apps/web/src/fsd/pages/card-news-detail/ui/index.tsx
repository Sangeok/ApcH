import type { CardNewsDetail } from "~/fsd/entities/card-news";
import type { CreditBalance } from "~/fsd/entities/user";
import { CardNewsEditor } from "~/fsd/widgets/card-news-editor";
export default function CardNewsDetailPage({
  userId,
  detail,
  generationEnabled,
  initialCreditBalance,
}: {
  userId: string;
  detail: CardNewsDetail;
  generationEnabled: boolean;
  initialCreditBalance: CreditBalance;
}) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <CardNewsEditor
        key={`${userId}:${detail.id}`}
        userId={userId}
        initialDetail={detail}
        generationEnabled={generationEnabled}
        initialCreditBalance={initialCreditBalance}
      />
    </main>
  );
}
