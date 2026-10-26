import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ClipboardDialog({
  open,
  onOpenChange,
  clipboardText,
  sendClipboard,
  connected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clipboardText: string;
  sendClipboard: (text: string) => void;
  connected: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const vmTextRef = useRef<HTMLTextAreaElement>(null);

  const copyVmText = async () => {
    try {
      await navigator.clipboard.writeText(clipboardText);
      setMessage("Copied to your clipboard.");
    } catch {
      vmTextRef.current?.focus();
      vmTextRef.current?.select();
      setMessage("Text selected. Use your copy shortcut to copy it.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>VM clipboard</DialogTitle>
          <DialogDescription>
            Your system clipboard is shared when browser access is allowed. If
            sharing is blocked, use these fields to move text manually.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="clipboard-to-vm" className="text-sm font-medium">
            Send to VM
          </label>
          <textarea
            id="clipboard-to-vm"
            className="w-full min-h-28 rounded-md border border-input bg-background p-3 text-sm"
            placeholder="Paste or type text here"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button
            disabled={!connected}
            onClick={() => {
              sendClipboard(draft);
              setMessage("Sent. Close this window and paste in the VM.");
            }}
          >
            Send to VM
          </Button>
        </div>
        <div className="space-y-2">
          <label htmlFor="clipboard-from-vm" className="text-sm font-medium">
            Copied in VM
          </label>
          <textarea
            id="clipboard-from-vm"
            ref={vmTextRef}
            className="w-full min-h-28 rounded-md border border-input bg-background p-3 text-sm"
            placeholder="Copy text inside the VM to see it here"
            value={clipboardText}
            readOnly
          />
          <Button variant="secondary" onClick={copyVmText}>
            Copy
          </Button>
        </div>
        {message && (
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
