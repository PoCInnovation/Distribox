import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getBrowserTimezone,
  getUtcOffset,
  listTimezones,
} from "@/hooks/useTimezone";
import { cn } from "@/lib/utils";

export const AUTO_TZ = "auto";

function tzLabel(tz: string): string {
  if (tz === AUTO_TZ) return "Automatic";
  return tz.replace(/_/g, " ");
}

function tzOffsetLabel(tz: string): string {
  return getUtcOffset(tz === AUTO_TZ ? getBrowserTimezone() : tz);
}

function localTime(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz === AUTO_TZ ? getBrowserTimezone() : tz,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());
  } catch {
    return "";
  }
}

const MAX_RESULTS = 80;

/**
 * Searchable timezone picker. Automatic (browser) and UTC are pinned first;
 * the rest is the full IANA list filtered by what you type.
 */
export function TimezoneCombobox({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (tz: string) => void;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const all = useMemo(() => listTimezones(), []);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, "_");
    const pinned = [AUTO_TZ, "UTC"];
    const rest = all.filter((tz) => tz !== "UTC");
    if (!q) return [...pinned, ...rest].slice(0, MAX_RESULTS);
    const hits = [...pinned, ...rest].filter((tz) => {
      if (tz === AUTO_TZ) return "automatic browser auto".includes(q);
      return tz.toLowerCase().includes(q);
    });
    return hits.slice(0, MAX_RESULTS);
  }, [all, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const item = listRef.current?.children[active] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = (tz: string) => {
    onChange(tz);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          className="flex h-9 w-full items-center justify-between gap-3 border border-input bg-transparent px-3 text-sm outline-none hover:bg-secondary/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate">{tzLabel(value)}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {value === AUTO_TZ
                ? `${getBrowserTimezone().replace(/_/g, " ")}, ${tzOffsetLabel(value)}`
                : tzOffsetLabel(value)}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const tz = results[active];
                if (tz) choose(tz);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder="Search city or region…"
            aria-label="Search timezones"
            autoComplete="off"
            spellCheck={false}
            className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ul
          ref={listRef}
          role="listbox"
          className="max-h-64 overflow-y-auto py-1"
        >
          {results.length === 0 && (
            <li className="px-3 py-4 text-center text-sm text-muted-foreground">
              Nothing matches “{query}”.
            </li>
          )}
          {results.map((tz, i) => {
            const selected = tz === value;
            return (
              <li
                key={tz}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(tz)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-sm",
                  i === active && "bg-secondary/60",
                  selected && "text-primary",
                )}
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate">{tzLabel(tz)}</span>
                  {tz === AUTO_TZ && (
                    <span className="truncate text-xs text-muted-foreground">
                      follows the browser
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-3 font-mono text-xs text-muted-foreground">
                  <span className="tabular-nums">{localTime(tz)}</span>
                  <span className="w-14 text-right">{tzOffsetLabel(tz)}</span>
                  <Check
                    className={cn(
                      "h-3.5 w-3.5",
                      selected ? "text-primary" : "invisible",
                    )}
                  />
                </span>
              </li>
            );
          })}
          {!query && all.length > MAX_RESULTS && (
            <li className="px-3 py-2 text-center text-xs text-muted-foreground">
              Type to search the other {all.length - MAX_RESULTS} zones.
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
