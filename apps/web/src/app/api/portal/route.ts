import { CustomerPortal } from "@polar-sh/nextjs";
import { env } from "~/env";
import { getUserPolarCustomerId } from "~/fsd/entities/user";
import { auth } from "~/server/auth";

export const GET = CustomerPortal({
  accessToken: env.POLAR_ACCESS_TOKEN,
  getCustomerId: async () => {
    const session = await auth();
    if (!session?.user?.id) return "";

    return getUserPolarCustomerId(session.user.id);
  },
  server: "sandbox",
});
