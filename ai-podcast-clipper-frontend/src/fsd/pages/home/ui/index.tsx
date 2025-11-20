"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import { Badge } from "~/fsd/shared/ui/atoms/badge";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/fsd/shared/ui/atoms/dropdown-menu";
import { Avatar, AvatarFallback } from "~/fsd/shared/ui/atoms/avatar";
import { signOut } from "next-auth/react";
import { coreFeatures, heroHighlights, workflowSteps } from "../constants";

interface HomePageProps {
  isLoggedIn: boolean;
  email: string | null;
}

export default function HomePage({ isLoggedIn, email }: HomePageProps) {
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
        <header className="flex items-center justify-between gap-4 py-6">
          <Link
            href="/"
            className="text-foreground text-lg font-semibold tracking-tight"
          >
            AI Podcast Clipper
          </Link>
          <div className="flex items-center gap-2">
            {!isLoggedIn && (
              <Button variant="outline" asChild>
                <Link href="/login">Log in</Link>
              </Button>
            )}
            {isLoggedIn && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-8 w-8 cursor-pointer rounded-full p-0"
                  >
                    <Avatar>
                      <AvatarFallback>{email?.charAt(0)}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>
                    <p className="text-muted-foreground text-xs">{email}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/billing">Billing</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => signOut({ redirectTo: "/login" })}
                    className="text-destructive cursor-pointer"
                  >
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-24 py-6">
          <section className="space-y-8">
            <div className="space-y-8">
              <Badge className="border-primary/30 bg-primary/5 text-primary w-fit gap-2 border">
                <Sparkles className="size-3.5" />
                Creator-first automation · Nov 2025
              </Badge>
              <div className="space-y-6">
                <h1 className="text-foreground text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
                  Clip the signal, skip the grind.
                </h1>
                <p className="text-muted-foreground max-w-2xl text-lg">
                  Podcast Clipper finds the high-converting moments inside every
                  episode, trims them with studio precision, and ships them to
                  every channel before the conversation goes stale.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg" className="gap-2">
                  <Link href="/dashboard">
                    Create a free workspace
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/dashboard">See product tour</Link>
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {heroHighlights.map((highlight) => (
                  <div
                    key={highlight.label}
                    className="border-border/80 bg-card/80 rounded-2xl border p-4 shadow-sm"
                  >
                    <p className="text-muted-foreground text-sm">
                      {highlight.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight">
                      {highlight.value}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {highlight.footnote}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-8">
            <div className="space-y-4">
              <Badge variant="secondary" className="w-fit">
                Built for modern creator teams
              </Badge>
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight">
                  Everything you need to ship clips that feel handcrafted.
                </h2>
                <p className="text-muted-foreground max-w-3xl text-lg">
                  Replace five tabs and countless revision threads. Podcast
                  Clipper pairs narrative intelligence with production-ready
                  outputs.
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {coreFeatures.map((feature) => (
                <Card key={feature.title} className="h-full px-2 py-4">
                  <CardHeader className="space-y-3">
                    <div className="text-primary flex items-center gap-3">
                      <feature.icon className="size-5" />
                      {feature.badge && (
                        <Badge variant="outline" className="text-xs uppercase">
                          {feature.badge}
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground text-sm">
                      {feature.footnote}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="flex w-full justify-center">
            <div className="space-y-6">
              <Badge variant="secondary" className="w-fit">
                Workflow in three beats
              </Badge>
              <h2 className="text-3xl font-semibold tracking-tight">
                Upload, approve, publish. That&apos;s it.
              </h2>
              <div className="space-y-4">
                {workflowSteps.map((step, index) => (
                  <div
                    key={step.title}
                    className="hover:border-primary/50 rounded-2xl border p-5 shadow-sm transition hover:shadow-md"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-2xl">
                        {index + 1}
                      </div>
                      <div className="space-y-1">
                        <p className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
                          {step.title}
                        </p>
                        <div className="text-muted-foreground flex items-center gap-2 text-sm">
                          <step.icon className="text-primary size-4" />
                          {step.detail}
                        </div>
                      </div>
                    </div>
                    <p className="text-foreground mt-3 text-base">
                      {step.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="from-primary/10 via-background to-background rounded-3xl border bg-gradient-to-br p-10 text-center shadow-md">
            <Badge variant="secondary" className="mx-auto mb-4 w-fit">
              Ready when you are
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight">
              Turn every episode into an always-on growth engine.
            </h2>
            <p className="text-muted-foreground mx-auto mt-3 max-w-2xl text-lg">
              Launch your workspace, invite collaborators, and see your first AI
              clip in less than five minutes.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link href="/signup">
                  Start free trial
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/login">Already have an account?</Link>
              </Button>
            </div>
          </section>
        </main>

        <footer className="text-muted-foreground py-10 text-center text-sm">
          Copyright © {new Date().getFullYear()} SangEok. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
