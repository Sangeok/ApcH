import Link from "next/link";
import { Button } from "~/fsd/shared/ui/atoms/button";
import { PUBLIC_NAV_ITEMS } from "../config/public-nav";

export default function PublicHeader() {
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

      <Button variant="outline" asChild>
        <Link href="/login">Log in</Link>
      </Button>
    </header>
  );
}
