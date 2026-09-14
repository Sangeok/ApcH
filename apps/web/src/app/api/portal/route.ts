import { type NextRequest, NextResponse } from "next/server";
import { getUserPolarCustomerId } from "~/fsd/entities/user/server";
import { getPolarClient, POLAR_SERVER } from "~/fsd/shared/api/polar";
import { reportError } from "~/fsd/shared/observability";
import { auth } from "~/server/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const userId = session.user.id;

  const customerId = await getUserPolarCustomerId(userId);
  if (customerId === null) {
    return NextResponse.redirect(new URL("/dashboard/billing", req.url));
  }

  try {
    const { customerPortalUrl } = await getPolarClient().customerSessions.create(
      { customerId },
    );
    return NextResponse.redirect(customerPortalUrl);
  } catch (error) {
    // 라이브러리 CustomerPortal은 이 예외를 console.error + NextResponse.error()
    // (본문 없는 500)로 삼킨다. 직접 감싸 Sentry에 server·customerId를 실어 보내면
    // 다음 발생이 스스로 진단된다(소유자가 지금 Vercel 로그에서 파는 값).
    reportError(error, {
      origin: "portal.customerSession",
      userId,
      server: POLAR_SERVER,
      customerId,
    });
    return NextResponse.redirect(
      new URL("/dashboard/billing?portal=error", req.url),
    );
  }
}
