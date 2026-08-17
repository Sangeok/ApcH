import type { Metadata } from "next";

import { LoginButton } from "~/fsd/features/admin-sign-in";

export const metadata: Metadata = {
  title: "Admin Login",
  robots: { index: false, follow: false },
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold">ApcH Admin</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            관리자 계정으로 로그인하세요.
          </p>
        </div>

        {error === "AccessDenied" && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            이 계정은 관리자 목록에 없습니다.
          </p>
        )}

        <LoginButton />
      </div>
    </main>
  );
}
