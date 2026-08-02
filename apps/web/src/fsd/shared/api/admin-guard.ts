import "server-only";

import { notFound, redirect } from "next/navigation";
import { env } from "~/env";
import { auth } from "~/server/auth";

function getAdminEmailSet() {
  return new Set(
    (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function requireAdmin() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const email = session.user.email?.toLowerCase();
  const adminEmails = getAdminEmailSet();

  if (!email || !adminEmails.has(email)) {
    notFound();
  }

  return {
    userId: session.user.id,
    email,
  };
}
