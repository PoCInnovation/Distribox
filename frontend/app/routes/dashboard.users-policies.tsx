import type { Route } from "./+types/dashboard.users-policies";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Users & Policies - Distribox" },
    { name: "description", content: "Manage users and policies" },
  ];
}

export { default } from "@/components/dashboard/users-policies-page";
