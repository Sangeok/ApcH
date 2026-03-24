import { Checkout } from "@polar-sh/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { env } from "~/env";
import { auth } from "~/server/auth";

const checkoutHandler = Checkout({
  accessToken: env.POLAR_ACCESS_TOKEN,
  successUrl: `${env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/dashboard/billing?success=true&checkout_id={CHECKOUT_ID}`,
  server:
    env.POLAR_SERVER ??
    (env.NODE_ENV === "production" ? "production" : "sandbox"),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  url.searchParams.set("metadata[userId]", session.user.id);

  if (session.user.email) {
    url.searchParams.set("customerEmail", session.user.email);
  }

  const securedReq = new NextRequest(url, req);
  return checkoutHandler(securedReq);
}
