export function AdminHeader({ email }: { email: string | null }) {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div>
          <p className="text-sm text-muted-foreground">Admin</p>
          <p className="font-medium">{email ?? "검증기 (읽기 전용)"}</p>
        </div>
      </div>
    </header>
  );
}
