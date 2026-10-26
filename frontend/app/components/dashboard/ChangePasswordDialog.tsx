import { useEffect, useId, useState } from "react";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword } from "@/lib/api";
import { useAuthz } from "@/contexts/authz-context";
import { cn } from "@/lib/utils";

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MIN_LENGTH = 8;

type Strength = 0 | 1 | 2 | 3 | 4;

function scorePassword(pw: string): { score: Strength; label: string } {
  if (pw.length === 0) return { score: 0, label: "" };
  if (pw.length < MIN_LENGTH) return { score: 1, label: "Too short" };
  let classes = 0;
  if (/[a-z]/.test(pw)) classes++;
  if (/[A-Z]/.test(pw)) classes++;
  if (/\d/.test(pw)) classes++;
  if (/[^a-zA-Z0-9]/.test(pw)) classes++;
  const long = pw.length >= 12;
  const veryLong = pw.length >= 16;
  if (veryLong && classes >= 3) return { score: 4, label: "Strong" };
  if ((long && classes >= 2) || classes >= 4) return { score: 3, label: "Good" };
  if (classes >= 2 || long) return { score: 2, label: "Fair" };
  return { score: 2, label: "Weak" };
}

/**
 * These are the user's own Distribox login credentials, so the inputs are real
 * password fields with the autocomplete hints browsers expect for a
 * change-password form (current-password / new-password).
 */
export function ChangePasswordDialog({
  open,
  onOpenChange,
}: ChangePasswordDialogProps) {
  const { user } = useAuthz();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const hintId = useId();

  useEffect(() => {
    if (!open) {
      const t = window.setTimeout(() => {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setError(null);
        setShowCurrent(false);
        setShowNew(false);
      }, 200);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const strength = scorePassword(newPassword);
  const longEnough = newPassword.length >= MIN_LENGTH;
  const differs = newPassword.length > 0 && newPassword !== currentPassword;
  const matches = confirmPassword.length > 0 && confirmPassword === newPassword;
  const canSubmit =
    currentPassword.length > 0 && longEnough && differs && matches && !isLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setIsLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast.success("Password changed");
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The password could not be changed.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">Change password</DialogTitle>
          <DialogDescription>
            For your Distribox login as{" "}
            <span className="font-mono text-foreground">{user.user}</span>.
            Other sessions stay signed in.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 space-y-5" noValidate>
          {/* Lets password managers associate the new password with the account. */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={user.user}
            readOnly
            tabIndex={-1}
            aria-hidden
            className="sr-only"
          />

          <PasswordInput
            id="current-password"
            label="Current password"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
            show={showCurrent}
            onToggleShow={() => setShowCurrent((v) => !v)}
            disabled={isLoading}
            autoFocus
          />

          <div className="space-y-2">
            <PasswordInput
              id="new-password"
              label="New password"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
              show={showNew}
              onToggleShow={() => setShowNew((v) => !v)}
              disabled={isLoading}
              describedBy={hintId}
            />
            <StrengthMeter score={strength.score} label={strength.label} />
            <ul id={hintId} className="space-y-0.5 text-xs">
              <Requirement ok={longEnough} pending={newPassword.length === 0}>
                At least {MIN_LENGTH} characters
              </Requirement>
              <Requirement
                ok={differs}
                pending={newPassword.length === 0 || currentPassword.length === 0}
              >
                Different from the current one
              </Requirement>
            </ul>
          </div>

          <div className="space-y-1.5">
            <PasswordInput
              id="confirm-password"
              label="Repeat new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              show={showNew}
              onToggleShow={() => setShowNew((v) => !v)}
              disabled={isLoading}
              invalid={confirmPassword.length > 0 && !matches}
            />
            {confirmPassword.length > 0 && (
              <p
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  matches ? "text-success" : "text-destructive",
                )}
                aria-live="polite"
              >
                {matches ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
                {matches ? "Passwords match" : "Doesn’t match the new password yet"}
              </p>
            )}
          </div>

          {error && (
            <p
              role="alert"
              className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isLoading ? "Changing…" : "Change password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  show,
  onToggleShow,
  disabled,
  autoFocus,
  invalid,
  describedBy,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  show: boolean;
  onToggleShow: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          spellCheck={false}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className="pr-10 font-mono"
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={show}
          tabIndex={-1}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function StrengthMeter({ score, label }: { score: Strength; label: string }) {
  const tone =
    score <= 1
      ? "bg-destructive"
      : score === 2
        ? "bg-warning"
        : score === 3
          ? "bg-primary"
          : "bg-success";
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 transition-colors",
              i <= score ? tone : "bg-border",
            )}
          />
        ))}
      </div>
      <span className="w-16 text-right font-mono text-[11px] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function Requirement({
  ok,
  pending,
  children,
}: {
  ok: boolean;
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-1.5",
        pending
          ? "text-muted-foreground"
          : ok
            ? "text-success"
            : "text-destructive",
      )}
    >
      {pending ? (
        <span className="inline-block h-1 w-1 bg-muted-foreground" />
      ) : ok ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <X className="h-3.5 w-3.5" />
      )}
      {children}
    </li>
  );
}
