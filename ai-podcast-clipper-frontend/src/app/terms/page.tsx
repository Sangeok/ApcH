import { type Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "이용약관",
  description: "AI Podcast Clipper 서비스 이용약관",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-12">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
        >
          &larr; AI Podcast Clipper
        </Link>
      </header>

      <div className="space-y-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">이용약관</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            시행일: 2026년 4월 3일
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            1. 서비스 개요
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            AI Podcast Clipper(이하 &quot;서비스&quot;)는 사용자가 업로드한
            팟캐스트 영상을 AI가 분석하여 30~60초 분량의 세로형 숏폼 클립을 자동
            생성하는 클라우드 기반 SaaS입니다. 서비스는 다음 AI 기술을
            활용합니다:
          </p>
          <ul className="text-muted-foreground list-disc space-y-1 pl-6">
            <li>
              Google Gemini 2.5 — 하이라이트 구간 탐지 및 YouTube 메타데이터 생성
            </li>
            <li>WhisperX — 단어 단위 음성 전사(transcription)</li>
            <li>
              Columbia ASD — 활성 화자 감지(Active Speaker Detection)를 통한
              얼굴 트래킹 기반 영상 크롭
            </li>
          </ul>
          <p className="text-muted-foreground leading-relaxed">
            업로드당 최대 3개의 클립이 생성되며, 다국어 자막(영어/한국어)과
            YouTube 메타데이터(제목, 설명, 해시태그)가 함께 제공됩니다.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            2. 계정 및 이용 자격
          </h2>
          <ul className="text-muted-foreground list-disc space-y-1 pl-6">
            <li>서비스는 Google OAuth를 통한 단일 인증 방식을 사용합니다.</li>
            <li>1인 1계정 원칙이며, 계정 공유는 금지됩니다.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            3. 크레딧 시스템
          </h2>
          <ul className="text-muted-foreground list-disc space-y-1 pl-6">
            <li>회원가입 시 3크레딧이 무료로 지급됩니다.</li>
            <li>
              영상 처리 완료 시 생성된 클립 수만큼 크레딧이 차감됩니다.
            </li>
            <li>
              구독을 통해 매월 크레딧이 충전됩니다.
            </li>
            <li>
              크레딧은 현금 가치가 없으며, 환불 및 양도가 불가합니다.
            </li>
            <li>계정 종료 시 잔여 크레딧은 소멸됩니다.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            4. 콘텐츠 소유권
          </h2>
          <ul className="text-muted-foreground list-disc space-y-1 pl-6">
            <li>업로드한 원본 영상의 소유권은 사용자에게 있습니다.</li>
            <li>
              사용자는 서비스 제공 목적에 한해 업로드 콘텐츠에 대한 제한적,
              비독점적 라이선스를 플랫폼에 부여합니다.
            </li>
            <li>
              AI가 생성한 클립, 자막, YouTube 메타데이터는 사용자에게 귀속됩니다.
            </li>
            <li>
              플랫폼은 사용자 콘텐츠에 대한 소유권을 주장하지 않으며, AI 모델
              학습에 사용하지 않습니다.
            </li>
            <li>
              단, 전사 텍스트는 Google Gemini API로 전송되며 Google의 약관에 따라
              처리될 수 있습니다.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            5. 사용자 의무 및 금지사항
          </h2>
          <ul className="text-muted-foreground list-disc space-y-1 pl-6">
            <li>
              사용자는 업로드하는 영상에 대한 저작권 또는 이용 권한을 보유해야
              합니다.
            </li>
            <li>
              플랫폼은 업로드 콘텐츠의 저작권 적법성을 검증하지 않습니다.
            </li>
            <li>
              저작권 침해물, 불법 콘텐츠, 제3자의 권리를 침해하는 콘텐츠의
              업로드는 금지됩니다.
            </li>
            <li>
              사용자는 업로드한 콘텐츠에 대한 모든 법적 책임을 부담합니다.
            </li>
            <li>
              저작권 침해 신고가 접수될 경우 해당 콘텐츠는 삭제 조치됩니다.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            6. AI 처리 고지
          </h2>
          <ul className="text-muted-foreground list-disc space-y-1 pl-6">
            <li>
              클립 구간 선택과 YouTube 메타데이터 생성은 AI가 자동으로 수행하며,
              인간의 검토 과정이 없습니다.
            </li>
            <li>
              클립 품질 및 메타데이터의 정확성은 보장되지 않습니다.
            </li>
            <li>
              얼굴 감지(Columbia ASD)는 영상 크롭 목적으로만 사용되며, 개인
              식별에 사용되지 않고 처리 후 즉시 삭제됩니다.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            7. 서비스 가용성 및 제한
          </h2>
          <ul className="text-muted-foreground list-disc space-y-1 pl-6">
            <li>
              서비스는 &quot;있는 그대로(as-is)&quot; 제공되며, 가용성이
              보장되지 않습니다.
            </li>
            <li>
              서비스는 외부 서비스(Modal.com, Google Gemini, AWS S3)에 의존하며,
              해당 서비스의 장애로 인한 중단이 발생할 수 있습니다.
            </li>
            <li>영상 처리의 최대 타임아웃은 1시간입니다.</li>
            <li>
              처리 실패 시 크레딧은 성공적으로 생성된 클립 수만큼만 차감됩니다.
            </li>
            <li>사용자당 동시 처리는 1건으로 제한됩니다.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            8. 결제 및 환불
          </h2>
          <ul className="text-muted-foreground list-disc space-y-1 pl-6">
            <li>
              결제는 Polar가 처리하며, 신용카드 정보는 플랫폼에 저장되지
              않습니다.
            </li>
            <li>
              구독 해지 시 잔여 기간 동안 서비스가 제공된 후 종료됩니다.
            </li>
            <li>크레딧 구매는 환불이 불가합니다.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            9. 책임 제한
          </h2>
          <ul className="text-muted-foreground list-disc space-y-1 pl-6">
            <li>
              서비스는 &quot;있는 그대로&quot; 제공되며, 명시적 또는 묵시적
              보증이 없습니다.
            </li>
            <li>
              AI 처리 품질 및 AI가 생성한 콘텐츠에 대한 법적 책임을 지지
              않습니다.
            </li>
            <li>
              최대 배상 한도는 최근 12개월간 사용자가 지불한 서비스 이용료로
              제한됩니다.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            10. 서비스 종료 및 계정 해지
          </h2>
          <ul className="text-muted-foreground list-disc space-y-1 pl-6">
            <li>사용자는 언제든 계정 삭제를 요청할 수 있습니다.</li>
            <li>
              이용약관 위반 시 사전 통지 없이 계정이 정지 또는 삭제될 수
              있습니다.
            </li>
            <li>
              계정 삭제 시 데이터베이스 레코드 및 저장된 파일이 전체 삭제됩니다.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">11. 준거법</h2>
          <p className="text-muted-foreground leading-relaxed">
            본 약관은 대한민국 법률에 따라 해석되며, 서비스와 관련된 분쟁의 관할
            법원은 서울 소재 법원으로 합니다.
          </p>
        </section>
      </div>

      <footer className="text-muted-foreground mt-16 space-y-2 border-t pt-8 text-center text-sm">
        <div className="flex justify-center gap-4">
          <Link
            href="/terms"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            이용약관
          </Link>
          <Link
            href="/privacy"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            개인정보 처리방침
          </Link>
        </div>
        <p>
          Copyright &copy; {new Date().getFullYear()} SangEok. All rights
          reserved.
        </p>
      </footer>
    </div>
  );
}
