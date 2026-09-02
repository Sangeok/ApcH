import { SearchX, Home, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";

// ErrorDisplay와 같은 규칙: 링크는 동반 데이터의 존재로 켠다.
interface NotFoundDisplayProps {
  title?: string;
  description?: string;
  /** 있으면 "뒤로 가기" 링크 */
  back?: { href: string; label?: string };
  /** 동반 데이터가 없는 고정 링크라 플래그로 남는다 */
  home?: boolean;
}

export function NotFoundDisplay({
  title = "Page not found",
  description = "The page you requested does not exist or has been moved.",
  back,
  home = true,
}: NotFoundDisplayProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <SearchX className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle className="text-5xl font-bold">404</CardTitle>
          <CardDescription className="mt-2">{title}</CardDescription>
          <p className="text-muted-foreground text-sm">{description}</p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap justify-center gap-2">
            {back && (
              <Button variant="outline" asChild>
                <Link href={back.href}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {back.label ?? "Go back"}
                </Link>
              </Button>
            )}
            {home && (
              <Button variant="default" asChild>
                <Link href="/">
                  <Home className="mr-2 h-4 w-4" />
                  Home
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
