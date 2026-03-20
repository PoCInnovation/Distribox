import { useCallback, useEffect, useRef, useState } from "react";
import { useGuacamoleClient } from "@/hooks/useGuacamoleClient";

const KEYSYM = {
  CTRL_L: 0xffe3,
  ALT_L: 0xffe9,
  SHIFT_L: 0xffe1,
  SUPER_L: 0xffeb,
  ESCAPE: 0xff1b,
  TAB: 0xff09,
  DELETE: 0xffff,
  F1: 0xffbe,
  F2: 0xffbf,
  F3: 0xffc0,
  F4: 0xffc1,
  F5: 0xffc2,
  F6: 0xffc3,
  F7: 0xffc4,
  F8: 0xffc5,
  F9: 0xffc6,
  F10: 0xffc7,
  F11: 0xffc8,
  F12: 0xffc9,
} as const;

type ModifierKey = "ctrl" | "alt" | "shift" | "super";

const MODIFIER_KEYS: { id: ModifierKey; label: string; keysym: number }[] = [
  { id: "ctrl", label: "Ctrl", keysym: KEYSYM.CTRL_L },
  { id: "alt", label: "Alt", keysym: KEYSYM.ALT_L },
  { id: "shift", label: "Shift", keysym: KEYSYM.SHIFT_L },
  { id: "super", label: "Super", keysym: KEYSYM.SUPER_L },
];

const ACTION_KEYS: { label: string; keysym: number }[] = [
  { label: "Esc", keysym: KEYSYM.ESCAPE },
  { label: "Tab", keysym: KEYSYM.TAB },
];

const F_KEYS: { label: string; keysym: number }[] = Array.from(
  { length: 12 },
  (_, i) => ({
    label: `F${i + 1}`,
    keysym: KEYSYM.F1 + i,
  }),
);

const HOVER_DELAY_MS = 400;
const INITIAL_OVERLAY_MS = 8000;

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

  const { state, error, sendKeyEvent, requestFullscreen, exitFullscreen, isFullscreen } =
    useGuacamoleClient(options);

  const [overlayVisible, setOverlayVisible] = useState(false);
  const [initialOverlay, setInitialOverlay] = useState(true);
  const [mouseInOverlay, setMouseInOverlay] = useState(false);
  const [activeModifiers, setActiveModifiers] = useState<
    Record<ModifierKey, boolean>
  >({
    ctrl: false,
    alt: false,
    shift: false,
    super: false,
  });

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state === "connected" && initialOverlay) {
      setOverlayVisible(true);
      const timer = setTimeout(() => {
        setInitialOverlay(false);
        setMouseInOverlay((inOverlay) => {
          if (!inOverlay) setOverlayVisible(false);
          return inOverlay;
        });
      }, INITIAL_OVERLAY_MS);
      return () => clearTimeout(timer);
    }
  }, [state, initialOverlay]);

  useEffect(() => {
    if (state !== "connected") return;

    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientY <= 5) {
        if (!hoverTimerRef.current && !overlayVisible) {
          hoverTimerRef.current = setTimeout(() => {
            setOverlayVisible(true);
            setInitialOverlay(false);
            hoverTimerRef.current = null;
          }, HOVER_DELAY_MS);
        }
      } else if (!overlayVisible) {
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    };
  }, [state, overlayVisible]);

  const handleOverlayEnter = useCallback(() => {
    setMouseInOverlay(true);
  }, []);

  const handleOverlayLeave = useCallback(() => {
    setMouseInOverlay(false);
    if (!initialOverlay) {
      setOverlayVisible(false);
    }
  }, [initialOverlay]);

  useEffect(() => {
    if (!overlayVisible) {
      setActiveModifiers((prev) => {
        for (const mod of MODIFIER_KEYS) {
          if (prev[mod.id]) {
            sendKeyEvent(false, mod.keysym);
          }
        }
        return { ctrl: false, alt: false, shift: false, super: false };
      });
    }
  }, [overlayVisible, sendKeyEvent]);

  const toggleModifier = useCallback(
    (id: ModifierKey, keysym: number) => {
      setActiveModifiers((prev) => {
        const next = !prev[id];
        sendKeyEvent(next, keysym);
        return { ...prev, [id]: next };
      });
    },
    [sendKeyEvent],
  );

  const pressKey = useCallback(
    (keysym: number) => {
      sendKeyEvent(true, keysym);
      sendKeyEvent(false, keysym);
    },
    [sendKeyEvent],
  );

  const sendCtrlAltDel = useCallback(() => {
    sendKeyEvent(true, KEYSYM.CTRL_L);
    sendKeyEvent(true, KEYSYM.ALT_L);
    sendKeyEvent(true, KEYSYM.DELETE);
    sendKeyEvent(false, KEYSYM.DELETE);
    sendKeyEvent(false, KEYSYM.ALT_L);
    sendKeyEvent(false, KEYSYM.CTRL_L);
  }, [sendKeyEvent]);

  const showOverlay = overlayVisible && state === "connected";

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

      {state === "connected" && !overlayVisible && (
        <div className="absolute top-0 left-0 right-0 h-2 z-50" />
      )}

      <div
        ref={overlayRef}
        className={`absolute top-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out ${
          showOverlay ? "translate-y-0" : "-translate-y-full pointer-events-none"
        }`}
        onMouseEnter={handleOverlayEnter}
        onMouseLeave={handleOverlayLeave}
      >
        <div className="mx-auto max-w-4xl mt-2 rounded-lg border border-white/20 bg-black/85 px-4 py-3 text-white backdrop-blur-md shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold tracking-wide opacity-80">
              Distribox
            </span>
            <div className="flex items-center gap-3">
              {initialOverlay && (
                <span className="text-xs text-white/60">
                  Login: <span className="font-mono font-semibold">user</span> /{" "}
                  <span className="font-mono font-semibold">password</span>
                </span>
              )}
              <button
                className="rounded bg-white/15 px-2 py-0.5 text-xs text-white hover:bg-white/25 transition-colors"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  isFullscreen ? exitFullscreen() : requestFullscreen()
                }
              >
                {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </button>
              <button
                className="text-white/50 hover:text-white text-xs"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOverlayVisible(false);
                  setInitialOverlay(false);
                }}
              >
                Close
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {MODIFIER_KEYS.map((mod) => (
              <button
                key={mod.id}
                className={`rounded px-2 py-1 font-medium transition-colors ${
                  activeModifiers[mod.id]
                    ? "bg-white text-black"
                    : "bg-white/15 hover:bg-white/25 text-white"
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => toggleModifier(mod.id, mod.keysym)}
              >
                {mod.label}
              </button>
            ))}

            <span className="mx-1 h-4 w-px bg-white/20" />

            {ACTION_KEYS.map((key) => (
              <button
                key={key.label}
                className="rounded bg-white/15 px-2 py-1 font-medium text-white hover:bg-white/25 transition-colors"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pressKey(key.keysym)}
              >
                {key.label}
              </button>
            ))}

            <button
              className="rounded bg-white/15 px-2 py-1 font-medium text-white hover:bg-red-600/80 transition-colors"
              onMouseDown={(e) => e.preventDefault()}
              onClick={sendCtrlAltDel}
            >
              Ctrl+Alt+Del
            </button>

            <span className="mx-1 h-4 w-px bg-white/20" />

            {F_KEYS.map((key) => (
              <button
                key={key.label}
                className="rounded bg-white/15 px-1.5 py-1 font-medium text-white hover:bg-white/25 transition-colors"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pressKey(key.keysym)}
              >
                {key.label}
              </button>
            ))}
          </div>

          {initialOverlay && (
            <p className="mt-2 text-xs text-white/50 text-center">
              Move your cursor to the top of the screen to access these controls
              at any time. Use Fullscreen to capture all keyboard keys including
              Super.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
