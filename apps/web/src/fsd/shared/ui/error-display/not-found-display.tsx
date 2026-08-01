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

interface NotFoundDisplayProps {
  title?: string;
  description?: string;
  showHome?: boolean;
  showBack?: boolean;
  backHref?: string;
  backLabel?: string;
}

export function NotFoundDisplay({
  title = "Page not found",
  description = "The page you requested does not exist or has been moved.",
  showHome = true,
  showBack = false,
  backHref = "/dashboard",
  backLabel = "Go back",
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
            {showBack && (
              <Button variant="outline" asChild>
                <Link href={backHref}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {backLabel}
                </Link>
              </Button>
            )}
            {showHome && (
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
