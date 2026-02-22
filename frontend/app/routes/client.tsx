import { useMemo } from "react";
import { useSearchParams } from "react-router";

export default function ClientRoute() {
  const [searchParams] = useSearchParams();
  const credential = searchParams.get("credential") ?? "";

  const hasCredential = useMemo(() => credential.trim().length > 0, [credential]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <section className="w-full max-w-2xl rounded-2xl border border-white/15 bg-black/25 p-8 text-center">
        <h1 className="text-3xl font-bold text-gray-100">Distribox Client</h1>
        <p className="mt-4 text-gray-300">
          {hasCredential
            ? "Credential received. You can now continue to your VM client flow."
            : "No credential was provided in the URL."}
        </p>
      </section>
    </main>
  );
}
