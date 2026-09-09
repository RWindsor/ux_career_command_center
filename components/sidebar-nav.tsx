"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navLinks } from "@/lib/nav-links";
import { cn } from "@/lib/utils";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {navLinks.map((link) => {
        const isActive = pathname === link.href;
        const Icon = link.icon;

        if (link.disabled) {
          return (
            <div
              key={link.href}
              className="flex cursor-not-allowed items-center justify-between rounded-md px-3 py-2 text-sm text-sidebar-fg/40"
            >
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4" />
                {link.label}
              </span>
              {link.badge && (
                <span className="rounded-full border border-sidebar-border px-2 py-0.5 text-[10px] tracking-wide text-sidebar-fg/40">
                  {link.badge}
                </span>
              )}
            </div>
          );
        }

        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-fg/80 transition-colors hover:bg-white/5 hover:text-sidebar-fg",
              isActive && "bg-white/10 text-sidebar-fg"
            )}
          >
            <Icon className="h-4 w-4" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
