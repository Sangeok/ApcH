"use client";

import { cn } from "~/fsd/shared/lib/utils";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import { signInWithGoogle } from "~/fsd/features/auth";
import { trackAnalyticsEvent } from "~/fsd/shared/analytics";
import { GoogleIcon } from "~/fsd/shared/ui/atoms/icons/google";

export default function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const handleGoogleSignIn = async () => {
    await trackAnalyticsEvent("login_started", { provider: "google" });
    await signInWithGoogle();
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>
            Sign in with your Google account to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => void handleGoogleSignIn()}
          >
            <GoogleIcon className="mr-2 size-4" />
            Continue with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
