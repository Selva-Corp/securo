import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 text-2xl font-semibold tracking-tight">
        Securo
      </Link>
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">{children}</div>
    </div>
  );
}
