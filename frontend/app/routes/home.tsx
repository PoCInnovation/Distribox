import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Distribox" },
    {
      name: "description",
      content: "Meets all your needs to share Virtual Machines.",
    },
  ];
}

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center">
    </div>
  );
}
