"use client";

import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export function LogoutButton() {
  return (
    <DropdownMenuItem onSelect={() => signOut()} className="text-destructive focus:text-destructive">
      <LogOut className="mr-2 h-4 w-4" />
      Sign out
    </DropdownMenuItem>
  );
}
