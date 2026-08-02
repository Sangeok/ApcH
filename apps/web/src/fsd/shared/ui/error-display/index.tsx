"use client";

import { AlertTriangle, Home, ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";

interface ErrorDisplayProps {
  /** 에러 제목 */
  title?: string;
  /** 사용자에게 보여줄 설명 */
  description?: string;
  /** Next.js 에러 digest (지원 요청 시 참조 코드) */
  digest?: string;
  /** full-page: min-h-screen, section: min-h-[50vh] */
  variant?: "full-page" | "section";
  /** "다시 시도" 버튼 표시 */
  showRetry?: boolean;
  /** retry 콜백 (error boundary의 reset 함수) */
  onRetry?: () => void;
  /** "홈으로" 링크 표시 */
  showHome?: boolean;
  /** "뒤로 가기" 링크 표시 */
  showBack?: boolean;
  /** 뒤로 가기 대상 경로 (기본: "/dashboard") */
  backHref?: string;
  /** 뒤로 가기 버튼 레이블 */
  backLabel?: string;
}

export function ErrorDisplay({
  title = "Something went wrong",
  description = "An error occurred while loading the page. Please try again later.",
  digest,
  variant = "full-page",
  showRetry = false,
  onRetry,
  showHome = false,
  showBack = false,
  backHref = "/dashboard",
  backLabel = "Go back",
}: ErrorDisplayProps) {
  const minHeight = variant === "full-page" ? "min-h-screen" : "min-h-[50vh]";

  return (
    <div className={`flex ${minHeight} flex-col items-center justify-center p-4`}>
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap justify-center gap-2">
            {showRetry && onRetry && (
              <Button onClick={onRetry} variant="default">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try again
              </Button>
            )}
            {showBack && (
              <Button variant="outline" asChild>
                <Link href={backHref}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {backLabel}
                </Link>
              </Button>
            )}
            {showHome && (
              <Button variant="outline" asChild>
                <Link href="/">
                  <Home className="mr-2 h-4 w-4" />
                  Home
                </Link>
              </Button>
            )}
          </div>

          {digest && (
            <p className="text-muted-foreground mt-2 text-xs">
              Error code:{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">
                {digest}
              </code>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
