import SiteHeader from "~/fsd/widgets/site-header/ui";
import SiteFooter from "~/fsd/widgets/site-footer/ui";
import HeroSection from "./_component/HeroSection";
import FeaturesSection from "./_component/FeaturesSection";
import WorkflowSection from "./_component/WorkflowSection";
import CtaSection from "./_component/CtaSection";

interface HomePageProps {
  isLoggedIn: boolean;
  email: string | null;
  image?: string | null;
}

export default function HomePage({ isLoggedIn, email, image }: HomePageProps) {
  return (
    <div className="bg-background text-foreground relative overflow-hidden">
      <div
        aria-hidden
        className="from-primary/10 via-background to-background pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b"
      />
      <div
        aria-hidden
        className="bg-primary/20 pointer-events-none absolute top-24 left-1/2 -z-10 h-72 w-72 -translate-x-1/2 rounded-full blur-3xl"
      />
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 pb-16">
        <SiteHeader isLoggedIn={isLoggedIn} email={email} image={image} />

        <main className="flex flex-1 flex-col gap-24 py-6">
          <HeroSection />
          <FeaturesSection />
          <WorkflowSection />
          <CtaSection />
        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
