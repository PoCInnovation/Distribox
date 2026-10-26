import * as React from "react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Keyboard hint. Pass keys as separate children: <Kbd>⌘</Kbd><Kbd>K</Kbd>. */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center border border-border bg-background/60 px-1 font-mono text-[10px] leading-none text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** A group of keys rendered side by side ("⌘ K", "⇧ ↵"). */
function KbdGroup({
  keys,
  className,
}: {
  keys: string | string[];
  className?: string;
}) {
  const list = Array.isArray(keys) ? keys : keys.split(" ");
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {list.map((k, i) => (
        <Kbd key={`${k}-${i}`}>{k}</Kbd>
      ))}
    </span>
  );
}

/** "⌘" on macOS, "Ctrl" elsewhere. Safe during SSR (falls back to "Ctrl"). */
function modKey(): string {
  if (typeof navigator === "undefined") return "Ctrl";
  return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
}

/** modKey() after mount, so server and client render the same first pass. */
function useModKey(): string {
  const [key, setKey] = useState("Ctrl");
  useEffect(() => setKey(modKey()), []);
  return key;
}

export { Kbd, KbdGroup, modKey, useModKey };
