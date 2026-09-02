"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "~/fsd/shared/ui/atoms/avatar";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/fsd/shared/ui/atoms/dropdown-menu";

interface HeaderAuthMenuProps {
  email: string | null;
  image?: string | null;
}

/**
 * 로그인한 방문자의 아바타 메뉴. `signOut`을 부르므로 클라이언트 컴포넌트다.
 *
 * 이것만 떼어 두면 헤더 본체는 서버 컴포넌트로 남을 수 있다 — 헤더 전체가
 * `"use client"`였던 것이 헤더 위젯이 둘로 갈라진 이유였다.
 */
export function HeaderAuthMenu({ email, image }: HeaderAuthMenuProps) {
  return (
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
  );
}
