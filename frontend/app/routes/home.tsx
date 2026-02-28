import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Image } from "@unpic/react";
import type { Route } from "./+types/home";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRoundIcon, UserIcon } from "lucide-react";

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
  const navigate = useNavigate();
  const [credential, setCredential] = useState("");

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedCredential = credential.trim();
    if (!trimmedCredential) return;

    navigate(`/client?credential=${encodeURIComponent(trimmedCredential)}`);
  };

  return (
    <main className="relative min-h-screen px-4 py-6 md:px-8 md:py-8">
      <Image
        className="absolute right-6 top-6 z-10 md:right-10 md:top-10"
        src="/favicon.ico"
        width={90}
        height={90}
        alt="Distribox logo"
      />
      <header className="flex justify-start">
        <div className="flex items-center gap-3 text-md text-muted-foreground">
          <Link to="/auth/login">
            <Button variant="outline" size="lg">
              Sign In
            </Button>
          </Link>
          <p>Have a Distribox user? Sign in to manage your VMs.</p>
          <UserIcon className="h-6 w-6" />
        </div>
      </header>

      <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-4xl items-center justify-center">
        <section className="w-full text-center">
          <h1 className="mb-4 text-5xl font-bold text-foreground md:text-6xl">
            Welcome to <span className="text-primary">Distribox</span>
          </h1>
          <p className="mb-10 text-md text-muted-foreground">
            Meets all your VM distribution and access needs.
          </p>

          <p className="flex flex-row items-center space-x-2 justify-center mb-4 text-xl text-foreground">
            <span>
              You were given{" "}
              <span className="font-bold text-primary">credentials?</span>
            </span>
            <KeyRoundIcon className="text-primary" />
          </p>

          <form
            className="mx-auto flex w-full max-w-3xl flex-col items-stretch gap-3 md:flex-row"
            onSubmit={onSubmit}
          >
            <Input
              type="password"
              value={credential}
              onChange={(event) => setCredential(event.target.value)}
              placeholder="Paste them here!"
              className="h-12 border-border bg-secondary/40 text-base"
            />
            <Button type="submit" size="lg" className="md:px-8 h-12">
              Connect
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}
