import { Checkout } from "@polar-sh/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { env } from "~/env";
import { POLAR_SERVER } from "~/fsd/shared/api/polar";
import { SITE_URL } from "~/fsd/shared/lib/site";
import { auth } from "~/server/auth";

// 앱의 다른 모든 절대 URL과 같은 오리진을 쓴다(shared/lib/site.ts).
const getBaseUrl = () => {
  if (env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }
  return SITE_URL;
};

const checkoutHandler = Checkout({
  accessToken: env.POLAR_ACCESS_TOKEN,
  successUrl: `${getBaseUrl()}/dashboard/billing?success=true&checkout_id={CHECKOUT_ID}`,
  server: POLAR_SERVER,
});

export async function GET(req: NextRequest) {
  if (env.NEXT_PUBLIC_SUBSCRIPTION_ENABLED === false) {
    return NextResponse.json(
      { error: "Subscriptions are currently disabled" },
      { status: 403 },
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  url.searchParams.set("metadata", JSON.stringify({ userId: session.user.id }));

  if (session.user.email) {
    url.searchParams.set("customerEmail", session.user.email);
  }

  const securedReq = new NextRequest(url, req);
  return checkoutHandler(securedReq);
}
