import { Link } from "react-router";
import { AlertTriangleIcon, ArrowLeftIcon, HouseIcon } from "lucide-react";
import { Image } from "@unpic/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface ErrorDisplayProps {
  code: string;
  title: string;
  description: string;
  showGoBack?: boolean;
  showRetry?: boolean;
  stack?: string;
}

export function ErrorDisplay({
  code,
  title,
  description,
  showGoBack = false,
  showRetry = false,
  stack,
}: ErrorDisplayProps) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-b from-black via-background to-primary/30 px-4 py-10">
      <Image
        className="absolute right-6 top-6 z-10 md:right-10 md:top-10"
        src="/favicon.ico"
        width={90}
        height={90}
        alt="Distribox logo"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,oklch(0.72_0.15_195_/_0.2),transparent_55%)]" />
      <Card className="relative z-10 w-full max-w-2xl border-primary/35 bg-card/85 shadow-xl backdrop-blur-sm">
        <CardHeader className="text-center">
          <Badge variant="secondary" className="mx-auto gap-1 text-xs">
            <AlertTriangleIcon className="size-3" />
            {code}
          </Badge>
          <CardTitle className="font-mono text-4xl text-primary">
            {title}
          </CardTitle>
          <CardDescription className="text-base text-muted-foreground">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {stack && (
            <>
              <Separator />
              <pre className="max-h-56 overflow-auto rounded-md border border-border/80 bg-black/50 p-3 text-left text-xs text-muted-foreground">
                <code>{stack}</code>
              </pre>
            </>
          )}
          <Separator />
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild>
              <Link to="/">
                <HouseIcon />
                Go Home
              </Link>
            </Button>
            {showRetry && (
              <Button
                variant="secondary"
                onClick={() => window.location.reload()}
              >
                Try Again
              </Button>
            )}
            {showGoBack && (
              <Button variant="outline" onClick={() => window.history.back()}>
                <ArrowLeftIcon />
                Go Back
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
