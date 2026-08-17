"use client";

import { signIn } from "next-auth/react";

import { Button } from "~/fsd/shared/ui/atoms/button";

export function LoginButton() {
  return (
    <Button
      className="w-full"
      onClick={() => void signIn("google", { callbackUrl: "/analytics" })}
    >
      Continue with Google
    </Button>
  );
}
