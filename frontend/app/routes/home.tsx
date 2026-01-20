import { Link } from "react-router";
import type { Route } from "./+types/home";
import { Button } from "@/components/ui/button";

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="max-w-3xl mx-auto text-center px-4">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">
          Welcome to Distribox
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Meets all your needs to share Virtual Machines.
        </p>
        <div className="flex gap-4 justify-center">
          <Link to="/auth/login">
            <Button size="lg">Sign In</Button>
          </Link>
        </div>
        <p className="text-sm text-gray-500 mt-4">
          Contact your administrator for an account
        </p>
      </div>
    </div>
  );
}
