import Link from "next/link";
import { logout } from "@/server/actions/auth";

/** Focused, sidebar-free shell for the setup wizard. */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-10 sm:justify-center">
      <Link href="/" className="mb-8 text-2xl font-semibold tracking-tight">
        Securo
      </Link>
      <div className="w-full max-w-xl rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">{children}</div>
      <form action={logout} className="mt-6">
        <button type="submit" className="text-sm text-muted hover:text-foreground">
          Sign out
        </button>
      </form>
    </div>
  );
}
