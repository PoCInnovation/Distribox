import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Image } from "@unpic/react";
import {
  AlertCircle,
  Calendar,
  Cpu,
  HardDrive,
  Loader2,
  MemoryStick,
  Server,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPublicEvent, joinEvent } from "@/lib/api/events";
import type { Event, EventJoinResponse } from "@/lib/types/event";

function isExpired(deadline: string): boolean {
  return new Date(deadline) < new Date();
}

function formatDeadline(deadline: string): string {
  return new Date(deadline).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function EventJoinPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

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
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-background/80 px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Branding header */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <Image
            src="/favicon.ico"
            width={48}
            height={48}
            alt=""
            draggable={false}
          />
          <h1 className="font-mono text-2xl font-bold tracking-wider text-foreground">
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
          <div className="rounded-2xl border border-border bg-card">
            {/* Event header */}
            <div className="border-b border-border p-6 text-center">
              <h2 className="text-2xl font-bold">{event.name}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Enter your name to get your Virtual Machine
              </p>
            </div>

            {/* Event info */}
            <div className="grid grid-cols-2 gap-3 border-b border-border p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Server className="h-3.5 w-3.5" />
                {event.vm_os.replace(".qcow2", "")}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Cpu className="h-3.5 w-3.5" />
                {event.vm_vcpus} vCPUs
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MemoryStick className="h-3.5 w-3.5" />
                {event.vm_mem} GB RAM
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <HardDrive className="h-3.5 w-3.5" />
                {event.vm_disk_size} GB Disk
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                {event.participants_count}/{event.max_vms} joined
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                {formatDeadline(event.deadline)}
              </div>
            </div>

            {/* Join form */}
            <div className="p-6">
              {isExpired(event.deadline) ? (
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
          </div>
        )}
      </div>
    </main>
  );
}
