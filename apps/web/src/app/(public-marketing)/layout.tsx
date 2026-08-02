import SiteFooter from "~/fsd/widgets/site-footer/ui";
import PublicHeader from "~/fsd/widgets/site-header/ui/public-header";

export default function PublicMarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 pb-16">
        <PublicHeader />
        <main className="flex flex-1 flex-col gap-20 py-6">{children}</main>
        <SiteFooter />
      </div>
    </div>
  );
}
