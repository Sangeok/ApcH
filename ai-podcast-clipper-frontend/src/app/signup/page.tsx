import { type Metadata } from "next";
import { redirect } from "next/navigation";
import SignupForm from "~/fsd/widgets/signupForm/ui";
import { auth } from "~/server/auth";

export const metadata: Metadata = {
  title: "Sign Up for Free",
  description:
    "Create a free AI Podcast Clipper account and start generating short-form clips from your podcasts automatically.",
  alternates: {
    canonical: "/signup",
  },
  openGraph: {
    title: "Sign Up for Free | AI Podcast Clipper",
    description:
      "Get 3 free credits and try AI-powered podcast clipping today.",
    url: "/signup",
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
        <SignupForm />
      </div>
    </div>
  );
}
