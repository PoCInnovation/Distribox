import { Link, useLocation } from "react-router";
import {
  LayoutIcon,
  Monitor,
  PlusIcon,
  LogOut,
  KeyRound,
  Users,
  User,
  ShieldAlert,
  PanelLeftClose,
  PanelLeftOpen,
  Calendar1Icon,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { isAdmin } from "@/lib/is-admin";
import { useAuthz } from "@/contexts/authz-context";
import type { PolicyName } from "@/lib/policy-utils";

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutIcon,
    requiredPolicies: [] as PolicyName[],
  },
  {
    href: "/dashboard/monitor",
    label: "Monitor",
    icon: Monitor,
    requiredPolicies: [Policy.VMS_GET] as PolicyName[],
  },
  {
    href: "/dashboard/provision",
    label: "Provision VM",
    icon: PlusIcon,
    requiredPolicies: [Policy.VMS_CREATE] as PolicyName[],
  },
  {
    href: "/dashboard/events",
    label: "Events",
    icon: Calendar1Icon,
    requiredPolicies: [Policy.EVENTS_GET] as PolicyName[],
  },
  {
    href: "/dashboard/users-policies",
    label: "Users & Policies",
    icon: Users,
    requiredPolicies: [Policy.USERS_GET] as PolicyName[],
  },
];

export function DashboardSidenav() {
  const { collapsed, toggle } = useSidebar();
  const { pathname } = useLocation();
  const authz = useAuthz();
  const { user } = authz;
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const collapsingTextClass =
    "overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-200 ease-out";

  const renderNavItem = (item: (typeof navItems)[number]) => {
    const missingPolicies = authz.missingPolicies(item.requiredPolicies);
    const isActive = pathname === item.href || pathname === `${item.href}/`;
    const Icon = item.icon;
    const missingPoliciesSummary = missingPolicies.join(", ");

    const itemContent =
      missingPolicies.length > 0 ? (
        <div
          className={cn(
            "group relative flex h-12 items-center gap-3 rounded-xl border border-dashed border-amber-400/40 bg-amber-500/10 px-3 text-sm text-amber-100/85 transition-[padding] duration-200 ease-out",
            collapsed ? "w-full justify-center gap-0 px-0" : "",
          )}
          role="note"
          aria-label={`${item.label} hidden. Missing policies: ${missingPoliciesSummary}`}
        >
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-300" />
          <span
            className={cn(
              "min-w-0 flex-1",
              collapsingTextClass,
              collapsed
                ? "max-w-0 -translate-x-1 opacity-0"
                : "max-w-[12rem] translate-x-0 opacity-100",
            )}
          >
            <span className="block truncate">{item.label}</span>
            <span className="block truncate text-[11px] text-amber-200/70">
              Missing: {missingPoliciesSummary}
            </span>
          </span>
        </div>
      ) : (
        <Link
          key={item.href}
          to={item.href}
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "group relative flex h-12 items-center gap-3 rounded-xl border px-3 text-sm font-medium transition-[padding,background-color,border-color,color] duration-200 ease-out",
            isActive
              ? "border-sidebar-primary/50 bg-sidebar-primary/15 text-sidebar-primary"
              : "border-transparent text-sidebar-foreground/75 hover:border-sidebar-border hover:bg-sidebar-accent/65 hover:text-sidebar-foreground",
            collapsed ? "w-full justify-center gap-0 px-0" : "",
          )}
        >
          {!collapsed && isActive && (
            <span className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
          )}
          <Icon
            className={cn(
              "h-5 w-5 shrink-0 transition-colors",
              isActive
                ? "text-sidebar-primary"
                : "text-sidebar-foreground/70 group-hover:text-sidebar-primary",
            )}
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              collapsingTextClass,
              collapsed
                ? "max-w-0 -translate-x-1 opacity-0"
                : "max-w-[12rem] translate-x-0 opacity-100",
            )}
          >
            {item.label}
          </span>
        </Link>
      );

    if (!collapsed) {
      return <div key={item.href}>{itemContent}</div>;
    }

    return (
      <Tooltip key={item.href}>
        <TooltipTrigger asChild>{itemContent}</TooltipTrigger>
        <TooltipContent side="right" align="center">
          {missingPolicies.length > 0
            ? `${item.label} (No access)`
            : item.label}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <aside
      onDragStart={(event) => event.preventDefault()}
      className={cn(
        "relative flex h-full flex-col overflow-hidden border-r border-sidebar-border/70 bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] select-none",
        collapsed ? "w-20" : "w-72",
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_oklch(0.72_0.15_195/0.15),_transparent_45%),linear-gradient(to_bottom,_oklch(0.16_0.015_240),_oklch(0.12_0.01_240))]" />

      <div className="relative z-10 flex h-full flex-col">
        <div className="border-b border-sidebar-border/75 p-3">
          <Link
            to="/dashboard"
            draggable={false}
            className={cn(
              "flex items-center gap-3 p-2 transition-[gap] duration-200 ease-out",
              collapsed ? "justify-center gap-0" : "",
            )}
          >
            <Image
              src="/favicon.ico"
              width={36}
              height={36}
              alt=""
              draggable={false}
            />
            <div
              className={cn(
                "min-w-0",
                collapsingTextClass,
                collapsed
                  ? "max-w-0 -translate-x-1 opacity-0"
                  : "max-w-[12rem] translate-x-0 opacity-100",
              )}
            >
              <p className="truncate font-mono text-lg font-semibold tracking-wide text-sidebar-foreground">
                DISTRIBOX
              </p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 space-y-2 p-3">
          <div className="flex h-5 items-center px-2">
            <p
              className={cn(
                "text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/45 transition-opacity duration-150 ease-out",
                collapsed ? "opacity-0" : "opacity-100",
              )}
            >
              Workspace
            </p>
          </div>
          {navItems.map(renderNavItem)}
        </nav>

        <div className="space-y-2 border-t border-sidebar-border/75 p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-12 w-full rounded-lg bg-transparent text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  collapsed
                    ? "justify-center gap-0 px-0"
                    : "justify-start gap-3 px-3",
                )}
                aria-label="Open user menu"
              >
                <User className="h-4 w-4 shrink-0" />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-left text-sm overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-150 ease-out",
                    collapsed
                      ? "max-w-0 opacity-0"
                      : "max-w-[12rem] opacity-100",
                  )}
                >
                  {user?.user || "Account"}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56 border-sidebar-border bg-sidebar text-sidebar-foreground"
            >
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {user?.user || "Loading..."}
                  </p>
                  {isAdmin(user) && (
                    <p className="text-xs leading-none text-sidebar-foreground/65">
                      Administrator
                    </p>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-sidebar-border" />
              {authz.hasPolicy(Policy.AUTH_CHANGE_PASSWORD) ? (
                <DropdownMenuItem
                  className="focus:bg-sidebar-accent focus:text-sidebar-foreground"
                  onClick={() => setChangePasswordOpen(true)}
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  <span>Change Password</span>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  disabled
                  className="text-sidebar-foreground/55 opacity-70"
                >
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

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggle}
                className={cn(
                  "size-14 rounded-lg bg-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  collapsed ? "mx-auto" : "ml-auto",
                )}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed ? (
                  <PanelLeftOpen className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" align="center">
              {collapsed ? "Expand sidebar" : "Collapse sidebar"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </aside>
  );
}
