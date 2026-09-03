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

// 액션은 플래그가 아니라 **동반 데이터의 존재**로 켠다. 이전 형태(showRetry +
// onRetry, showBack + backHref)는 짝이 어긋난 호출을 타입이 통과시키고
// 런타임에 조용히 아무 버튼도 그리지 않았다 — 에러 화면에서 복구 수단만
// 사라지는 결함이라 리뷰에서도 보이지 않는다.
interface ErrorDisplayProps {
  /** 에러 제목 */
  title?: string;
  /** 사용자에게 보여줄 설명 */
  description?: string;
  /** Next.js 에러 digest (지원 요청 시 참조 코드) */
  digest?: string;
  /** full-page: min-h-screen, section: min-h-[50vh] */
  variant?: "full-page" | "section";
  /** 있으면 "Try again" 버튼. 보통 error boundary의 reset 함수 */
  retry?: { onRetry: () => void };
  /** 있으면 "뒤로 가기" 링크 */
  back?: { href: string; label?: string };
  /** 동반 데이터가 없는 고정 링크라 플래그로 남는다 */
  home?: boolean;
}

export function ErrorDisplay({
  title = "Something went wrong",
  description = "An error occurred while loading the page. Please try again later.",
  digest,
  variant = "full-page",
  retry,
  back,
  home = false,
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
            {retry && (
              <Button onClick={retry.onRetry} variant="default">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try again
              </Button>
            )}
            {back && (
              <Button variant="outline" asChild>
                <Link href={back.href}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {back.label ?? "Go back"}
                </Link>
              </Button>
            )}
            {home && (
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
