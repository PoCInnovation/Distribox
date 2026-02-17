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
import { useState } from "react";
import { signOut } from "@/lib/api";
import { Policy } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { isAdmin } from "@/lib/is-admin";
import { useAuthz } from "@/contexts/authz-context";
import { PolicyNotice } from "@/components/policy/policy-notice";
import type { PolicyName } from "@/lib/policy-utils";

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutIcon,
    requiredPolicies: [Policy.VMS_GET] as PolicyName[],
  },
  {
    href: "/dashboard/provision",
    label: "Provision VM",
    icon: PlusIcon,
    requiredPolicies: [Policy.VMS_CREATE] as PolicyName[],
  },
];

export function DashboardSidenav() {
  const { collapsed, toggle } = useSidebar();
  const { pathname } = useLocation();
  const authz = useAuthz();
  const { user } = authz;
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  return (
    <aside
      className={cn(
        "relative flex flex-col border-r border-border bg-sidebar transition-all duration-300",
        collapsed ? "w-18" : "w-64",
      )}
    >
      <div className="flex h-16 pl-4 items-center border-b border-border pointer-events-none">
        <Image className="" src="/favicon.ico" width={45} height={45} alt="" />
        {!collapsed && (
          <span className="ml-3 font-mono text-lg font-bold tracking-tight text-foreground">
            DISTRIBOX
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const missingPolicies = authz.missingPolicies(item.requiredPolicies);
          const isActive =
            pathname === item.href || pathname === item.href + "/";
          const Icon = item.icon;
          if (missingPolicies.length > 0) {
            return (
              <PolicyNotice
                key={item.href}
                compact
                title={`${item.label} Hidden`}
                missingPolicies={missingPolicies}
              />
            );
          }
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
                <span className="ml-2 truncate">{user.user}</span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {user?.user || "Loading..."}
                </p>
                {isAdmin(user) && (
                  <p className="text-xs leading-none text-muted-foreground">
                    Administrator
                  </p>
                )}
              </div>
            </DropdownMenuLabel>
            {authz.hasPolicy(Policy.AUTH_CHANGE_PASSWORD) ? (
              <DropdownMenuItem
                className="focus:bg-secondary focus:text-white"
                onClick={() => setChangePasswordOpen(true)}
              >
                <DropdownMenuSeparator />
                <KeyRound className="mr-2 h-4 w-4" />
                <span>Change Password</span>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled className="text-muted-foreground">
                <KeyRound className="mr-2 h-4 w-4" />
                <span>Change Password (missing: auth:changePassword)</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="focus:bg-destructive/10 text-destructive focus:text-destructive"
              onClick={signOut}
            >
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
