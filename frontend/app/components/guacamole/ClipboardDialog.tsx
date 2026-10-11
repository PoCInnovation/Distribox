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
  sendClipboard: (text: string) => boolean;
  connected: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const remoteTextRef = useRef<HTMLTextAreaElement>(null);

  const readSystemClipboard = async () => {
    try {
      if (!navigator.clipboard?.readText) throw new Error("Unavailable");
      setDraft(await navigator.clipboard.readText());
      setMessage("");
    } catch {
      setMessage(
        "Paste text into the field below with your usual paste shortcut.",
      );
    }
  };

  const copyRemoteClipboard = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Unavailable");
      await navigator.clipboard.writeText(clipboardText);
      setMessage("VM text copied to the system clipboard.");
    } catch {
      remoteTextRef.current?.focus();
      remoteTextRef.current?.select();
      setMessage("VM text selected. Use your usual copy shortcut to copy it.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>VM clipboard</DialogTitle>
          <DialogDescription>
            Transfer text between this device and the VM. These fields also work
            when the browser blocks clipboard access.
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
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={readSystemClipboard}>
              Paste from system
            </Button>
            <Button
              disabled={!connected}
              onClick={() => {
                setMessage(
                  sendClipboard(draft)
                    ? "Sent to the VM clipboard. Close this window and paste in the VM."
                    : "The VM is disconnected. Reconnect before sending text.",
                );
              }}
            >
              Send to VM
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="clipboard-from-vm" className="text-sm font-medium">
            Copied in VM
          </label>
          <textarea
            id="clipboard-from-vm"
            ref={remoteTextRef}
            className="w-full min-h-28 rounded-md border border-input bg-background p-3 text-sm"
            placeholder="Copy text inside the VM to see it here"
            value={clipboardText}
            readOnly
          />
          <Button variant="secondary" onClick={copyRemoteClipboard}>
            Copy to system
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
