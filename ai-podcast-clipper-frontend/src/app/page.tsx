import HomePage from "~/fsd/pages/home/ui";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

export default async function Home() {
  const session = await auth();
  const userId = session?.user?.id;
  const isLoggedIn = !!userId;

  let email: string | null = null;

  if (userId) {
    const user = await db.user.findUniqueOrThrow({
      where: {
        id: userId,
      },
      select: {
        email: true,
      },
    });

    email = user.email;
  }

  return <HomePage isLoggedIn={isLoggedIn} email={email} />;
}
