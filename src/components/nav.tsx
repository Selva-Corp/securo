"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Inbox,
  LayoutDashboard,
  PiggyBank,
  Settings,
  Tags,
  Target,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/review", label: "Review", icon: Inbox },
  { href: "/budget", label: "Budget", icon: PiggyBank },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function SideNav({ reviewCount }: { reviewCount: number }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-accent/15 text-foreground" : "text-muted hover:bg-border/40 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span className="flex-1">{label}</span>
            {href === "/review" && reviewCount > 0 && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                {reviewCount > 99 ? "99+" : reviewCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Compact bottom tab bar for phones. */
export function BottomNav({ reviewCount }: { reviewCount: number }) {
  const pathname = usePathname();
  const primary = items.filter((i) => ["/dashboard", "/review", "/budget", "/transactions", "/settings"].includes(i.href));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-card md:hidden">
      {primary.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "relative flex flex-col items-center gap-1 py-2 text-[11px] font-medium",
              active ? "text-accent" : "text-muted",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
            {label}
            {href === "/review" && reviewCount > 0 && (
              <span className="absolute right-4 top-1 h-2 w-2 rounded-full bg-accent" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
