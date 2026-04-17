"use client";

import "client-only";

import { signIn } from "next-auth/react";

export async function signInWithGoogle(callbackUrl = "/dashboard") {
  await signIn("google", { callbackUrl });
}
