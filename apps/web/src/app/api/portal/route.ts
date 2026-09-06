import { CustomerPortal } from "@polar-sh/nextjs";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env";
import { getUserPolarCustomerId } from "~/fsd/entities/user/server";
import { POLAR_SERVER } from "~/fsd/shared/api/polar";
import { auth } from "~/server/auth";

const portalHandler = CustomerPortal({
  accessToken: env.POLAR_ACCESS_TOKEN,
  getCustomerId: async () => {
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Unauthorized customer portal request");
    }

    const customerId = await getUserPolarCustomerId(session.user.id);
    if (customerId === null) {
      throw new Error("User has no Polar customer id");
    }

    return customerId;
  },
  server: POLAR_SERVER,
});

export async function GET(req: NextRequest) {
  // 포털 핸들러에 빈 문자열을 넘기면 Polar가 불투명한 오류를 돌려준다.
  // 로그인·고객 등록 여부를 여기서 먼저 판정해 사용자에게 갈 곳을 준다.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const customerId = await getUserPolarCustomerId(session.user.id);
  if (customerId === null) {
    return NextResponse.redirect(new URL("/dashboard/billing", req.url));
  }

  return portalHandler(req);
}
