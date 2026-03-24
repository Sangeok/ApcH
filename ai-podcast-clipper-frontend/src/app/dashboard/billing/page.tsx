import { getBillingData } from "~/fsd/features/billing/api";
import { getProductIds } from "~/fsd/features/billing/constants";
import { BillingPage } from "~/fsd/features/billing/ui/BillingPage";

export default async function BillingRoute({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const params = await searchParams;
  const result = await getBillingData();

  if (!result.success) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">Failed to load billing data.</p>
      </div>
    );
  }

  return (
    <BillingPage
      data={result.data}
      productIds={getProductIds()}
      showSuccessBanner={params.success === "true"}
    />
  );
}
