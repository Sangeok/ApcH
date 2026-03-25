import { type Metadata } from "next";
import { redirect } from "next/navigation";
import LoginForm from "~/fsd/widgets/loginForm/ui";
import { auth } from "~/server/auth";

export const metadata: Metadata = {
  title: "Sign In",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function Page() {
  const session = await auth();

  if (session) {
    redirect("/dashboard");
  }
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </div>
  );
}
