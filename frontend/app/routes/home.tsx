import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import type { Route } from "./+types/home";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Distribox" },
    {
      name: "description",
      content: "Connect to a virtual machine with a credential.",
    },
  ];
}

export default function Home() {
  const navigate = useNavigate();
  const [credential, setCredential] = useState("");
  const [revealed, setRevealed] = useState(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedCredential = credential.trim();
    if (!trimmedCredential) return;

    navigate(`/client?credential=${encodeURIComponent(trimmedCredential)}`);
  };

  return (
    <AuthShell panelFooter="Credentials are issued per virtual machine by whoever runs it.">
      <section>
        <h1 className="font-mono text-2xl font-semibold tracking-tight text-foreground">
          Connect to a VM
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Paste the credential you were given. It opens the machine's screen in
          this browser.
        </p>

        <form className="mt-8 space-y-5" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="vm-credential">VM credential</Label>
            <div className="relative">
              {/* A VM credential is not a login password: plain text input, masked by CSS,
                  with password-manager opt-outs so browsers never offer to save it. */}
              <Input
                id="vm-credential"
                name="vm-access-code"
                type="text"
                inputMode="text"
                value={credential}
                onChange={(event) => setCredential(event.target.value)}
                placeholder="e.g. correct-horse-battery"
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                data-1p-ignore
                data-lpignore="true"
                data-bwignore
                data-form-type="other"
                className={cn(
                  "h-10 bg-card pr-10 font-mono",
                  !revealed && "masked-secret",
                )}
              />
              <button
                type="button"
                onClick={() => setRevealed((v) => !v)}
                aria-label={revealed ? "Hide credential" : "Show credential"}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                {revealed ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>
          <Button
            type="submit"
            className="h-10 w-full"
            disabled={!credential.trim()}
          >
            Connect
          </Button>
        </form>

        <p className="mt-8 text-sm text-muted-foreground">
          Manage machines instead?{" "}
          <Link
            to="/auth/login"
            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
          >
            Sign in
            <ArrowRight className="size-3.5" />
          </Link>
        </p>
      </section>
    </AuthShell>
  );
}
