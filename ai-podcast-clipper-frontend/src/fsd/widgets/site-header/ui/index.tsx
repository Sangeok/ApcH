"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "~/fsd/shared/ui/atoms/avatar";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/fsd/shared/ui/atoms/dropdown-menu";

interface SiteHeaderProps {
  isLoggedIn: boolean;
  email: string | null;
  image?: string | null;
}

export default function SiteHeader({ isLoggedIn, email, image }: SiteHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 py-6">
      <Link
        href="/"
        className="text-foreground text-lg font-semibold tracking-tight"
      >
        AI Podcast Clipper
      </Link>
      <div className="flex items-center gap-2">
        {!isLoggedIn && (
          <Button variant="outline" asChild>
            <Link href="/login">Log in</Link>
          </Button>
        )}
        {isLoggedIn && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-8 w-8 cursor-pointer rounded-full p-0"
              >
                <Avatar>
                  {image && <AvatarImage src={image} alt={email ?? ""} />}
                  <AvatarFallback>{email?.charAt(0)}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>
                <p className="text-muted-foreground text-xs">{email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/billing">Billing</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => signOut({ redirectTo: "/login" })}
                className="text-destructive cursor-pointer"
              >
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
