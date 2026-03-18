import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Image } from "@unpic/react";
import { AlertCircle, Loader2, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPublicEvent, joinEvent } from "@/lib/api/events";
import type { Event, EventJoinResponse } from "@/lib/types/event";
import { EventInfoCard } from "@/components/event-info-card";

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function EventJoinPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const now = useNow(10000);

  const {
    data: event,
    isLoading,
    isError,
    error,
  } = useQuery<Event>({
    queryKey: ["public-event", slug],
    queryFn: () => getPublicEvent(slug!),
    enabled: !!slug,
    retry: false,
  });

  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinResult, setJoinResult] = useState<EventJoinResponse | null>(null);

  const handleJoin = async () => {
    if (!name.trim() || !slug) return;
    setJoining(true);
    setJoinError(null);

    try {
      const result = await joinEvent(slug, name.trim());
      setJoinResult(result);

      // Redirect to client after a brief delay
      setTimeout(() => {
        navigate(
          `/client?credential=${encodeURIComponent(result.credential_password)}`,
        );
      }, 3000);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Failed to join event");
    } finally {
      setJoining(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-primary to-background px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Branding header */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <Image
            src="/favicon.ico"
            width={120}
            height={120}
            alt=""
            draggable={false}
          />
          <h1 className="font-mono text-4xl font-bold tracking-wider">
            DISTRIBOX
          </h1>
        </div>

        {isLoading && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p>Loading event...</p>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/50 bg-card p-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-lg font-medium text-destructive">
              Event not found
            </p>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error
                ? error.message
                : "This event may not exist or has been removed."}
            </p>
          </div>
        )}

        {event && joinResult && (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-chart-3/50 bg-card p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-chart-3/10">
              <Server className="h-7 w-7 text-chart-3" />
            </div>
            <h2 className="text-xl font-bold">VM Provisioned!</h2>
            <div className="w-full space-y-2 rounded-lg bg-muted/30 p-4 text-left">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">VM Name</span>
                <span className="font-mono">{joinResult.vm_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Username</span>
                <span className="font-mono">{joinResult.credential_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Password</span>
                <span className="font-mono">
                  {joinResult.credential_password}
                </span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Redirecting to your VM...
            </p>
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}

        {event && !joinResult && (
          <EventInfoCard
            name={event.name}
            description="Enter your name to get your Virtual Machine"
            vmOs={event.vm_os}
            vmVcpus={event.vm_vcpus}
            vmMem={event.vm_mem}
            vmDiskSize={event.vm_disk_size}
            participantsCount={event.participants_count}
            maxVms={event.max_vms}
            deadline={event.deadline}
          >
            {/* Join form */}
            <div className="p-6">
              {new Date(event.deadline) < now ? (
                <div className="flex flex-col items-center gap-2 text-center">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                  <p className="font-medium text-destructive">
                    This event has expired
                  </p>
                </div>
              ) : event.participants_count >= event.max_vms ? (
                <div className="flex flex-col items-center gap-2 text-center">
                  <AlertCircle className="h-6 w-6 text-amber-500" />
                  <p className="font-medium text-amber-500">
                    This event is full
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="participant-name">Your Name</Label>
                    <Input
                      id="participant-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., John Doe"
                      onKeyDown={(e) =>
                        e.key === "Enter" && name.trim() && handleJoin()
                      }
                    />
                  </div>

                  {joinError && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-3">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <p className="text-sm text-destructive">{joinError}</p>
                    </div>
                  )}

                  <Button
                    className="w-full"
                    disabled={!name.trim() || joining}
                    onClick={handleJoin}
                  >
                    {joining ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Provisioning your VM...
                      </>
                    ) : (
                      "Get My Virtual Machine"
                    )}
                  </Button>
                </div>
              )}
            </div>
          </EventInfoCard>
        )}
      </div>
    </main>
  );
}
