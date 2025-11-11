import type { Route } from "./+types/dashboard._index";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Dashboard - Distribox" },
    { name: "description", content: "Distribox Dashboard" },
  ];
}

export { default } from "@/components/dashboard/overview-page";
