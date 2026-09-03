import Link from "next/link";
import { TrackedLink } from "~/fsd/shared/analytics";
import { Button } from "~/fsd/shared/ui/atoms/button";
import { PUBLIC_NAV_ITEMS } from "../config/public-nav";
import { HeaderAuthMenu } from "./_component/HeaderAuthMenu";

interface PublicHeaderProps {
  isLoggedIn?: boolean;
  email?: string | null;
  image?: string | null;
}

/**
 * 공개 페이지의 헤더. 서버 컴포넌트다 — 세션을 스스로 읽지 않고 props로 받는다.
 *
 * 이전에는 이 파일과 `ui/index.tsx`(SiteHeader)가 로고 블록과 nav를 바이트
 * 동일하게 중복했고 꼬리만 달랐다. 그래서 로그인한 방문자가 `/`에서는 아바타를,
 * `/features`·`/pricing`에서는 "Log in"을 봤다 — 그 페이지가 어느 컴포넌트를
 * 임포트했는지의 우연이었다.
 *
 * 인자 없이 부르면 로그아웃 헤더다. `(public-marketing)` 레이아웃이 그렇게
 * 쓰므로 그 15개 라우트는 `auth()` 없이 static으로 남는다.
 */
export default function PublicHeader({
  isLoggedIn = false,
  email = null,
  image = null,
}: PublicHeaderProps = {}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 py-6">
      <Link
        href="/"
        className="text-foreground text-lg font-semibold tracking-tight"
      >
        AI Podcast Clipper
      </Link>

      <nav className="text-muted-foreground order-3 flex w-full flex-wrap items-center gap-x-6 gap-y-2 text-sm md:order-none md:w-auto">
        {PUBLIC_NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        {isLoggedIn ? (
          <HeaderAuthMenu email={email} image={image} />
        ) : (
          <Button variant="outline" asChild>
            {/* ⚠️ 분석 연속성: 합쳐지기 전 두 버튼은 location이 달랐다
                ("site_header" = 홈, "public_header" = 마케팅 15 라우트).
                하나만 남길 수 있어 트래픽이 큰 쪽인 "public_header"를 골랐다 —
                15개 라우트의 시계열은 이어지고 홈의 것만 이쪽으로 합류한다.
                허용 목록은 이 변화를 잡지 않으므로 되돌리려면 여기 한 단어다. */}
            <TrackedLink
              href="/login"
              metadata={{ location: "public_header", cta: "log_in" }}
            >
              Log in
            </TrackedLink>
          </Button>
        )}
      </div>
    </header>
  );
}
