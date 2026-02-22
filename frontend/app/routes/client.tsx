import { useSearchParams } from "react-router";
import { GuacamoleDisplay } from "@/components/guacamole/GuacamoleDisplay";

function NoCredentialPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <section className="w-full max-w-2xl rounded-2xl border border-white/15 bg-black/25 p-8 text-center">
        <h1 className="text-3xl font-bold text-gray-100">Distribox Client</h1>
        <p className="mt-4 text-gray-300">No credential was provided in the URL.</p>
      </section>
    </main>
  );
}

export default function ClientRoute() {
  const [searchParams] = useSearchParams();
  const credential = searchParams.get("credential") ?? "";

  if (!credential.trim()) return <NoCredentialPage />;
  return <GuacamoleDisplay credential={credential} />;
}
