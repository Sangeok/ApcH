import { type Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보 처리방침",
  description: "AI Podcast Clipper 개인정보 처리방침",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
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
          <h1 className="text-3xl font-semibold tracking-tight">
            개인정보 처리방침
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            시행일: 2026년 4월 3일
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            1. 개인정보처리자
          </h2>
          <ul className="text-muted-foreground list-disc space-y-1 pl-6">
            <li>처리자명: HamSangEok</li>
            <li>
              연락처:{" "}
              <a
                href="mailto:hamsoo159@gmail.com"
                className="underline underline-offset-4"
              >
                hamsoo159@gmail.com
              </a>
            </li>
          </ul>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-semibold tracking-tight">
            2. 수집하는 개인정보
          </h2>

          <div className="space-y-3">
            <h3 className="text-base font-medium">계정 정보</h3>
            <div className="overflow-x-auto">
              <table className="text-muted-foreground w-full text-sm">
                <thead>
                  <tr className="border-border border-b">
                    <th className="text-foreground py-2 pr-4 text-left font-medium">
                      데이터
                    </th>
                    <th className="text-foreground py-2 text-left font-medium">
                      출처
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-border border-b">
                    <td className="py-2 pr-4">이메일 주소</td>
                    <td className="py-2">Google OAuth</td>
                  </tr>
                  <tr className="border-border border-b">
                    <td className="py-2 pr-4">이름</td>
                    <td className="py-2">Google OAuth</td>
                  </tr>
                  <tr className="border-border border-b">
                    <td className="py-2 pr-4">프로필 이미지 URL</td>
                    <td className="py-2">Google OAuth</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-base font-medium">서비스 이용 데이터</h3>
            <div className="overflow-x-auto">
              <table className="text-muted-foreground w-full text-sm">
                <thead>
                  <tr className="border-border border-b">
                    <th className="text-foreground py-2 pr-4 text-left font-medium">
                      데이터
                    </th>
                    <th className="text-foreground py-2 text-left font-medium">
                      설명
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-border border-b">
                    <td className="py-2 pr-4">업로드 영상 파일</td>
                    <td className="py-2">
                      사용자가 업로드한 원본 영상 (AWS S3 저장)
                    </td>
                  </tr>
                  <tr className="border-border border-b">
                    <td className="py-2 pr-4">생성 클립 파일</td>
                    <td className="py-2">
                      AI가 생성한 숏폼 클립 (AWS S3 저장)
                    </td>
                  </tr>
                  <tr className="border-border border-b">
                    <td className="py-2 pr-4">전사 텍스트</td>
                    <td className="py-2">
                      WhisperX/Gemini가 생성한 자막 스크립트
                    </td>
                  </tr>
                  <tr className="border-border border-b">
                    <td className="py-2 pr-4">YouTube 메타데이터</td>
                    <td className="py-2">
                      Gemini가 생성한 제목, 설명, 해시태그
                    </td>
                  </tr>
                  <tr className="border-border border-b">
                    <td className="py-2 pr-4">크레딧 잔액</td>
                    <td className="py-2">서비스 이용량 관리</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-base font-medium">결제 데이터</h3>
            <div className="overflow-x-auto">
              <table className="text-muted-foreground w-full text-sm">
                <thead>
                  <tr className="border-border border-b">
                    <th className="text-foreground py-2 pr-4 text-left font-medium">
                      데이터
                    </th>
                    <th className="text-foreground py-2 text-left font-medium">
                      설명
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-border border-b">
                    <td className="py-2 pr-4">Polar 고객 ID</td>
                    <td className="py-2">
                      결제 연동용 식별자 (신용카드 정보 미보관)
                    </td>
                  </tr>
                  <tr className="border-border border-b">
                    <td className="py-2 pr-4">구독/주문 기록</td>
                    <td className="py-2">플랜, 금액, 상태, 기간</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-base font-medium">쿠키</h3>
            <p className="text-muted-foreground text-sm">
              인증에 필수적인 쿠키만 사용하며, 분석/광고 쿠키는 사용하지
              않습니다.
            </p>
            <div className="overflow-x-auto">
              <table className="text-muted-foreground w-full text-sm">
                <thead>
                  <tr className="border-border border-b">
                    <th className="text-foreground py-2 pr-4 text-left font-medium">
                      쿠키명
                    </th>
                    <th className="text-foreground py-2 pr-4 text-left font-medium">
                      목적
                    </th>
                    <th className="text-foreground py-2 text-left font-medium">
                      유효기간
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-border border-b">
                    <td className="py-2 pr-4">authjs.session-token</td>
                    <td className="py-2 pr-4">JWT 세션 인증</td>
                    <td className="py-2">30일</td>
                  </tr>
                  <tr className="border-border border-b">
                    <td className="py-2 pr-4">authjs.csrf-token</td>
                    <td className="py-2 pr-4">CSRF 방지</td>
                    <td className="py-2">세션</td>
                  </tr>
                  <tr className="border-border border-b">
                    <td className="py-2 pr-4">authjs.callback-url</td>
                    <td className="py-2 pr-4">OAuth 리다이렉트</td>
                    <td className="py-2">세션</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            3. 개인정보 처리 위탁 (제3자)
          </h2>
          <div className="overflow-x-auto">
            <table className="text-muted-foreground w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="text-foreground py-2 pr-4 text-left font-medium">
                    서비스
                  </th>
                  <th className="text-foreground py-2 pr-4 text-left font-medium">
                    전송 데이터
                  </th>
                  <th className="text-foreground py-2 pr-4 text-left font-medium">
                    목적
                  </th>
                  <th className="text-foreground py-2 text-left font-medium">
                    서버 위치
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-border border-b">
                  <td className="py-2 pr-4">Google (OAuth)</td>
                  <td className="py-2 pr-4">이메일, 이름, 프로필 이미지</td>
                  <td className="py-2 pr-4">사용자 인증</td>
                  <td className="py-2">미국</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 pr-4">Google (Gemini API)</td>
                  <td className="py-2 pr-4">전사 텍스트</td>
                  <td className="py-2 pr-4">
                    AI 하이라이트 탐지, 메타데이터 생성
                  </td>
                  <td className="py-2">미국</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 pr-4">AWS S3</td>
                  <td className="py-2 pr-4">영상 파일, 클립 파일</td>
                  <td className="py-2 pr-4">파일 저장</td>
                  <td className="py-2">호주 (시드니)</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 pr-4">Neon</td>
                  <td className="py-2 pr-4">DB 전체 데이터</td>
                  <td className="py-2 pr-4">데이터베이스 호스팅</td>
                  <td className="py-2">미국</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 pr-4">Polar</td>
                  <td className="py-2 pr-4">이메일, 결제 정보</td>
                  <td className="py-2 pr-4">결제 처리</td>
                  <td className="py-2">미국</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 pr-4">Modal.com</td>
                  <td className="py-2 pr-4">영상 파일</td>
                  <td className="py-2 pr-4">GPU 영상 처리</td>
                  <td className="py-2">미국</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 pr-4">Inngest</td>
                  <td className="py-2 pr-4">작업 이벤트 데이터</td>
                  <td className="py-2 pr-4">백그라운드 작업 처리</td>
                  <td className="py-2">미국</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 pr-4">Vercel</td>
                  <td className="py-2 pr-4">요청 로그</td>
                  <td className="py-2 pr-4">프론트엔드 호스팅</td>
                  <td className="py-2">서울</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            4. 개인정보 보유 기간
          </h2>
          <div className="overflow-x-auto">
            <table className="text-muted-foreground w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="text-foreground py-2 pr-4 text-left font-medium">
                    데이터 유형
                  </th>
                  <th className="text-foreground py-2 text-left font-medium">
                    보유기간
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-border border-b">
                  <td className="py-2 pr-4">계정 정보</td>
                  <td className="py-2">계정 삭제 시까지</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 pr-4">영상/클립 파일</td>
                  <td className="py-2">사용자 삭제 시까지</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 pr-4">전사 텍스트/메타데이터</td>
                  <td className="py-2">클립 삭제 시까지</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 pr-4">결제 기록</td>
                  <td className="py-2">5년 (세법 의무)</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 pr-4">얼굴 감지 임시 데이터</td>
                  <td className="py-2">처리 완료 즉시 삭제</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            5. 개인정보 보호
          </h2>
          <ul className="text-muted-foreground list-disc space-y-1 pl-6">
            <li>모든 통신은 HTTPS로 암호화됩니다.</li>
            <li>세션 토큰은 httpOnly, Secure 쿠키로 관리됩니다.</li>
            <li>
              신용카드 정보는 플랫폼에 저장되지 않습니다 (Polar가 PCI DSS를
              준수합니다).
            </li>
            <li>
              얼굴 감지 데이터는 영상 크롭 목적으로만 임시 처리되며, 데이터베이스에
              저장되지 않습니다.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">
            6. 이용자 권리
          </h2>
          <ul className="text-muted-foreground list-disc space-y-1 pl-6">
            <li>
              본인의 개인정보에 대해 열람, 정정, 삭제를 요청할 수 있습니다.
            </li>
            <li>
              계정 삭제 요청 시 모든 데이터(데이터베이스 레코드 및 저장된 파일)가
              삭제됩니다.
            </li>
            <li>
              요청은{" "}
              <a
                href="mailto:hamsoo159@gmail.com"
                className="underline underline-offset-4"
              >
                hamsoo159@gmail.com
              </a>
              으로 접수해 주시기 바랍니다.
            </li>
          </ul>
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
