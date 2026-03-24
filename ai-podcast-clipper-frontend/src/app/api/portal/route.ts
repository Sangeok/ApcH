import { CustomerPortal } from "@polar-sh/nextjs";
import { env } from "~/env";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

export const GET = CustomerPortal({
  accessToken: env.POLAR_ACCESS_TOKEN,
  getCustomerId: async () => {
    const session = await auth();
    if (!session?.user?.id) return "";

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { polarCustomerId: true },
    });

    return user?.polarCustomerId ?? "";
  },
  server:
    env.POLAR_SERVER ??
    (env.NODE_ENV === "production" ? "production" : "sandbox"),
});
