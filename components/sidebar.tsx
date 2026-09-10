import Link from "next/link";
import { Compass } from "lucide-react";
import { SidebarNav } from "@/components/sidebar-nav";

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-fg md:flex">
      <div className="flex h-16 items-center gap-2 px-5">
        <Compass className="h-5 w-5 text-sidebar-accent" strokeWidth={2.25} />
        <Link href="/dashboard" className="font-display text-[15px] font-semibold tracking-tight">
          Command Center
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <SidebarNav />
      </div>
      <div className="border-t border-sidebar-border px-5 py-4 text-xs text-sidebar-fg/40">
        Pipeline · Interview Prep · Recruiters · Analytics
      </div>
    </aside>
  );
}
