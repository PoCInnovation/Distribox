import { Link, useLocation } from "react-router";
import {
  ChevronLeft,
  ChevronRight,
  LayoutIcon,
  PlusIcon,
  User,
  LogOut,
  KeyRound,
} from "lucide-react";
import { Image } from "@unpic/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/contexts/sidebar-context";
import { useState, useEffect } from "react";
import { getCurrentUser, signOut, type User as UserType } from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChangePasswordDialog } from "./ChangePasswordDialog";

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutIcon,
  },
  {
    href: "/dashboard/provision",
    label: "Provision VM",
    icon: PlusIcon,
  },
];

export function DashboardSidenav() {
  const { collapsed, toggle } = useSidebar();
  const { pathname } = useLocation();
  const [user, setUser] = useState<UserType | null>(null);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch((err) => {
        console.error("Failed to fetch user:", err);
      });
  }, []);

  return (
    <aside
      className={cn(
        "relative flex flex-col border-r border-border bg-sidebar transition-all duration-300",
        collapsed ? "w-18" : "w-64",
      )}
    >
      <div className="flex h-16 pl-3 items-center border-b border-border pointer-events-none">
        <Image className="" src="/favicon.ico" width={50} height={50} alt="" />
        {!collapsed && (
          <span className="ml-3 font-mono text-lg font-bold tracking-tight text-foreground">
            DISTRIBOX
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname === item.href + "/";
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all",
                "border border-transparent",
                isActive
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:border-border hover:bg-secondary hover:text-foreground",
                collapsed ? "justify-center" : "",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3 space-y-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "w-full border border-border hover:bg-primary/10 hover:text-primary hover:border-primary",
                collapsed ? "justify-center" : "justify-start",
              )}
            >
              <User className="h-4 w-4" />
              {!collapsed && user && (
                <span className="ml-2 truncate">{user.username}</span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {user?.username || "Loading..."}
                </p>
                {user?.is_admin && (
                  <p className="text-xs leading-none text-muted-foreground">
                    Administrator
                  </p>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setChangePasswordOpen(true)}>
              <KeyRound className="mr-2 h-4 w-4" />
              <span>Change Password</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={signOut} className="text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ChangePasswordDialog
          open={changePasswordOpen}
          onOpenChange={setChangePasswordOpen}
        />

        <Button
          variant="ghost"
          size="sm"
          onClick={toggle}
          className="w-full justify-center border border-border hover:bg-primary/10 hover:text-primary hover:border-primary"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span className="ml-2">Collapse</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
