import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * Text input for secrets that are NOT the user's own login password
 * (VM credentials, API keys, participant secrets).
 *
 * Deliberately not `type="password"`: browsers and password managers would
 * otherwise offer to save/autofill them. Masking is done with CSS
 * (`-webkit-text-security`) and can be toggled.
 */
function MaskedInput({
  className,
  revealable = true,
  name = "secret-value",
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & {
  revealable?: boolean;
}) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input
        type="text"
        name={name}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        data-bwignore
        data-form-type="other"
        className={cn(
          "font-mono",
          !visible && "masked-secret",
          revealable && "pr-9",
          className,
        )}
        {...props}
      />
      {revealable && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={visible ? "Hide secret" : "Show secret"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          className="absolute top-1/2 right-1 inline-flex size-7 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      )}
    </div>
  );
}

export { MaskedInput };
