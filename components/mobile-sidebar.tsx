"use client";

import * as React from "react";
import Link from "next/link";
import { Compass, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet";
import { SidebarNav } from "@/components/sidebar-nav";

export function MobileSidebar() {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left">
        <div className="mb-6 flex items-center gap-2">
          <Compass className="h-5 w-5 text-sidebar-accent" strokeWidth={2.25} />
          <Link href="/dashboard" className="font-display text-[15px] font-semibold tracking-tight" onClick={() => setOpen(false)}>
            Command Center
          </Link>
        </div>
        <SidebarNav onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
