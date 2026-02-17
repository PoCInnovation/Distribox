import { AlertTriangle } from "lucide-react";

export function PolicyNotice({
  title = "Content Hidden",
  description = "Some content is hidden because your account is missing required policies.",
  missingPolicies,
  compact = false,
}: {
  title?: string;
  description?: string;
  missingPolicies: string[];
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-md border border-amber-500/35 bg-amber-500/10 ${compact ? "p-3" : "p-4"}`}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-300" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-amber-200">{title}</p>
          <p className="text-xs text-amber-100/85">{description}</p>
          {missingPolicies.length > 0 && (
            <p className="text-xs text-amber-100/85">
              Missing policies: {missingPolicies.join(", ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
