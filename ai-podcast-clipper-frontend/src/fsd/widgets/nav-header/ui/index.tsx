"use client";

import Link from "next/link";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import { Button } from "~/fsd/shared/ui/atoms/button";

interface NavHeaderProps {
  credits: number;
  email: string;
}

export default function NavHeader({ credits, email }: NavHeaderProps) {
  return (
    <header className="bg-background sticky top-0 z-10 flex justify-center border-b">
      <div className="container flex h-16 items-center justify-between px-4 py-2">
        <Link href="/dashboard" className="flex items-center">
          <div className="font-sans text-xl font-medium tracking-tight">
            <span className="text-foreground">Podcast</span>
            <span className="font-light text-gray-500">/</span>
            <span className="text-foreground font-light">Clipper</span>
          </div>
        </Link>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="h-8 px-3 py-1.5 text-xs font-medium"
            >
              {credits} Credits
            </Badge>
            <Button
              variant="outline"
              size="sm"
              asChild
              className="h-8 text-xs font-medium"
            >
              <Link href="/dashboard/billing">Buy more</Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
