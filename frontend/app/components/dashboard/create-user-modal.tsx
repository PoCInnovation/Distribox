import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CreateUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (username: string, password?: string) => void;
  isCreating: boolean;
  generatedPassword?: string;
}

export function CreateUserModal({
  open,
  onOpenChange,
  onCreate,
  isCreating,
  generatedPassword,
}: CreateUserModalProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      onCreate(username.trim(), password.trim() || undefined);
    }
  };

  const handleClose = () => {
    setUsername("");
    setPassword("");
    setShowPassword(false);
    onOpenChange(false);
  };

  const copyPassword = () => {
    if (generatedPassword) {
      navigator.clipboard.writeText(generatedPassword);
      toast.success("Password copied to clipboard!");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New User</DialogTitle>
          <DialogDescription>
            {generatedPassword
              ? "User created successfully! Save the password below."
              : "Create a new user account. Leave password empty to generate one automatically."}
          </DialogDescription>
        </DialogHeader>
        {generatedPassword ? (
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-md">
              <Label className="text-sm font-medium mb-2 block">
                Generated Password
              </Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm bg-background p-2 rounded border">
                  {generatedPassword}
                </code>
                <Button size="sm" variant="outline" onClick={copyPassword}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Make sure to save this password. You won't be able to see it
                again.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  required
                />
              </div>
              <div>
                <Label htmlFor="password">Password (optional)</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Leave empty to auto-generate"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? "Creating..." : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
