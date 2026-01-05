import type { Route } from "./+types/dashboard.provision";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Provision - Distribox" },
    { name: "description", content: "Provision Virtual Machines" },
  ];
}

export { default } from "@/components/dashboard/provision-page";
