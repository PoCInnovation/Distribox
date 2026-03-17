import { useRef, useState } from "react";
import { useGuacamoleClient } from "@/hooks/useGuacamoleClient";

type GuacamoleDisplayProps =
  | { mode?: "credential"; credential: string }
  | { mode: "vm"; vmId: string; token: string };

export function GuacamoleDisplay(props: GuacamoleDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const options =
    "vmId" in props
      ? {
          mode: "vm" as const,
          vmId: props.vmId,
          token: props.token,
          containerRef,
        }
      : {
          mode: "credential" as const,
          credential: props.credential,
          containerRef,
        };

  const { state, error } = useGuacamoleClient(options);
  const [hintDismissed, setHintDismissed] = useState(false);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <style>{`
        .guacamole-display, .guacamole-display * {
          cursor: none !important;
        }
      `}</style>
      <div ref={containerRef} className="guacamole-display w-full h-full" />

      {state === "connecting" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white">
          <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
          <p className="text-lg font-medium">Connecting to VM...</p>
        </div>
      )}

      {state === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white">
          <p className="text-lg font-semibold text-destructive">
            Connection failed
          </p>
          {error && (
            <p className="mt-2 text-sm text-muted-foreground max-w-md text-center">
              {error}
            </p>
          )}
        </div>
      )}

      {state === "disconnected" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white">
          <p className="text-lg font-medium">Disconnected</p>
        </div>
      )}

      {state === "connected" && !hintDismissed && (
        <div className="absolute bottom-4 right-4 flex items-center gap-3 rounded-lg border border-white/20 bg-black/70 px-4 py-2 text-sm text-white backdrop-blur">
          <span>
            Login: <span className="font-mono font-semibold">user</span> /{" "}
            <span className="font-mono font-semibold">password</span>
          </span>
          <button
            className="ml-1 text-white/60 hover:text-white"
            onClick={() => setHintDismissed(true)}
            aria-label="Dismiss hint"
          >
            x
          </button>
        </div>
      )}
    </div>
  );
}
