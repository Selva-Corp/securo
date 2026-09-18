import { LogOut } from "lucide-react";
import { requireUser } from "@/server/session";
import { prisma } from "@/lib/prisma";
import { logout } from "@/server/actions/auth";
import { BottomNav, SideNav } from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const reviewCount = await prisma.transaction.count({ where: { userId: user.id, reviewedAt: null } });

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card px-4 py-6 md:flex">
        <div className="mb-8 px-3 text-xl font-semibold tracking-tight">Securo</div>
        <SideNav reviewCount={reviewCount} />
        <div className="mt-auto border-t border-border pt-4">
          <div className="truncate px-3 text-sm font-medium">{user.name ?? user.email}</div>
          <div className="truncate px-3 text-xs text-muted">{user.email}</div>
          <form action={logout} className="mt-3">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-border/40 hover:text-foreground"
            >
              <LogOut className="h-4 w-4" aria-hidden /> Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10 md:pt-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
      <BottomNav reviewCount={reviewCount} />
    </div>
  );
}
