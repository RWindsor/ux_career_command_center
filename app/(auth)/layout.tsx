import { Compass } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-8 flex items-center gap-2">
        <Compass className="h-6 w-6 text-primary" strokeWidth={2.25} />
        <span className="font-display text-lg font-semibold tracking-tight">Command Center</span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
      <p className="mt-8 max-w-sm text-center text-xs text-muted-foreground">
        A personal CRM for running your UX &amp; product design job search.
      </p>
    </div>
  );
}
