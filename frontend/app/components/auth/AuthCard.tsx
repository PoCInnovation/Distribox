interface AuthCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

/** Heading block for a form inside an AuthShell. */
export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <section>
      <h1 className="font-mono text-2xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
      <div className="mt-8">{children}</div>
    </section>
  );
}
