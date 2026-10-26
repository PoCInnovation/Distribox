import { Outlet } from "react-router";
import type { Route } from "./+types/dashboard";
import { DashboardSidenav } from "~/components/dashboard/sidenav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { CommandPaletteProvider } from "@/components/command-palette";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Dashboard - Distribox" },
    { name: "description", content: "Distribox Dashboard" },
  ];
}

export default function DashboardLayout() {
  return (
    <ProtectedRoute>
      <CommandPaletteProvider>
        <div className="flex h-screen overflow-hidden">
          <DashboardSidenav />
          <main className="flex-1 overflow-y-auto min-w-0">
            <Outlet />
          </main>
        </div>
      </CommandPaletteProvider>
    </ProtectedRoute>
  );
}
