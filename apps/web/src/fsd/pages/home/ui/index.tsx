import type { ReactNode } from "react";
import SiteFooter from "~/fsd/widgets/site-footer/ui";
import HeroSection from "./_component/HeroSection";
import FeaturesSection from "./_component/FeaturesSection";
import WorkflowSection from "./_component/WorkflowSection";
import CtaSection from "./_component/CtaSection";

// 이 페이지는 세 인증 필드를 쓰지 않는다 — 헤더로 그대로 넘기기만 했다.
// 슬롯으로 받으면 헤더의 props가 바뀌어도 이 파일은 그대로다.
interface HomePageProps {
  header: ReactNode;
}

export default function HomePage({ header }: HomePageProps) {
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
        {header}

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
