import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CalendarX,
  Link2Off,
  Loader2,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/AuthShell";
import { getPublicEvent, joinEvent } from "@/lib/api/events";
import { ApiHttpError } from "@/lib/api/core";
import type { PublicEvent } from "@/lib/types/event";
import { useTimezone, formatDateTime } from "@/hooks/useTimezone";
import { EventInfoCard } from "@/components/event-info-card";
import { useNow } from "@/components/dashboard/events/event-model";

export function EventJoinPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const now = useNow(10_000);
  const timeZone = useTimezone();

  const {
    data: event,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useQuery<PublicEvent>({
    queryKey: ["public-event", slug],
    queryFn: () => getPublicEvent(slug!),
    enabled: !!slug,
    retry: false,
  });

  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const handleJoin = async () => {
    if (!name.trim() || !slug) return;
    setJoining(true);
    setJoinError(null);

    try {
      const result = await joinEvent(slug, name.trim());
      // Straight onto the machine; the client toolbar offers SSH from there.
      navigate(
        `/client?credential=${encodeURIComponent(result.credential_password)}`,
      );
    } catch (err) {
      setJoinError(
        err instanceof Error ? err.message : "Could not join the event.",
      );
      setJoining(false);
    }
  };

  const expired = event ? new Date(event.deadline) <= now : false;
  const full = event ? event.participants_count >= event.max_vms : false;

  return (
    <AuthShell
      tagline={
        event && !expired && !full
          ? "You have been invited to an event. Enter your name and you land on your own virtual machine, right in the browser."
          : "Event links hand out virtual machines for labs, workshops and hackathons, one per person."
      }
      contentClassName="max-w-md"
    >
      {isLoading || !slug ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading event">
          <div className="h-7 w-64 animate-pulse bg-secondary" />
          <div className="h-40 animate-pulse border border-border bg-card" />
        </div>
      ) : isError && error instanceof ApiHttpError && error.status === 404 ? (
        <Notice
          icon={<Link2Off className="size-5" />}
          title="No event at this link"
          tone="muted"
        >
          <p>
            <span className="font-mono text-foreground/85">/events/{slug}</span>{" "}
            does not exist or was deleted. Check the address with the organiser.
          </p>
        </Notice>
      ) : isError || !event ? (
        <Notice
          icon={<AlertCircle className="size-5" />}
          title="Unable to load the event"
          tone="warning"
        >
          <p role="alert">
            {error instanceof ApiHttpError
              ? error.status >= 500
                ? "The server is temporarily unavailable. Please try again."
                : "The event could not be loaded. Please try again."
              : "Could not connect to the server. Check your connection and try again."}
          </p>
          <Button
            type="button"
            className="mt-3"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Retrying…
              </>
            ) : (
              "Retry"
            )}
          </Button>
        </Notice>
      ) : (
        <section>
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-balance text-foreground">
            {event.name}
          </h1>

          <EventInfoCard
            event={event}
            className={expired || full ? "mt-6 opacity-70" : "mt-6"}
          />

          {expired ? (
            <Notice
              icon={<CalendarX className="size-5" />}
              title="Joining is closed"
              tone="muted"
              className="mt-6"
            >
              <p>
                The deadline was {formatDateTime(event.deadline, timeZone)}. If
                you already joined, use the link you were sent then. Otherwise
                ask the organiser for a new event.
              </p>
            </Notice>
          ) : full ? (
            <Notice
              icon={<UsersRound className="size-5" />}
              title={`All ${event.max_vms} seats are taken`}
              tone="warning"
              className="mt-6"
            >
              <p>Ask the organiser to add seats, then reload this page.</p>
            </Notice>
          ) : (
            <form
              className="mt-8 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void handleJoin();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="participant-name">Your name</Label>
                <Input
                  id="participant-name"
                  value={name}
                  autoFocus
                  autoComplete="name"
                  maxLength={64}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ada Lovelace"
                  disabled={joining}
                  className="h-10 placeholder:text-muted-foreground/50"
                />
              </div>

              {joinError && (
                <p
                  role="alert"
                  className="flex items-start gap-2 border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  {joinError}
                </p>
              )}

              <Button
                type="submit"
                className="h-10 w-full"
                disabled={!name.trim() || joining}
              >
                {joining ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Starting your machine…
                  </>
                ) : (
                  "Get my machine"
                )}
              </Button>
            </form>
          )}
        </section>
      )}
    </AuthShell>
  );
}

function Notice({
  icon,
  title,
  tone,
  className,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone: "muted" | "warning";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex gap-3 border bg-card p-4 ${tone === "warning" ? "border-warning/40" : "border-border"} ${className ?? ""}`}
    >
      <span
        className={
          tone === "warning" ? "text-warning" : "text-muted-foreground"
        }
      >
        {icon}
      </span>
      <div className="min-w-0 space-y-1 text-sm text-muted-foreground">
        <p className="font-mono font-medium text-foreground">{title}</p>
        {children}
      </div>
    </div>
  );
}
