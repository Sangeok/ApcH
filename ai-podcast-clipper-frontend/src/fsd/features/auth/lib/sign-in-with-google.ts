"use client";


import { signIn } from "next-auth/react";

export async function signInWithGoogle(callbackUrl = "/dashboard") {
  await signIn("google", { callbackUrl });
}
