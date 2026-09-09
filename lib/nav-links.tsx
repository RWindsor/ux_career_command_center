import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, Briefcase, FileText, Settings } from "lucide-react";

export interface NavLink {
  label: string;
  href: string;
  icon: LucideIcon;
  disabled?: boolean;
  badge?: string;
}

export const navLinks: NavLink[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Job Pipeline", href: "/dashboard/jobs", icon: Briefcase, disabled: true, badge: "Phase 2" },
  { label: "Resume Library", href: "/dashboard/resumes", icon: FileText, disabled: true, badge: "Phase 2" },
  { label: "Settings", href: "/dashboard/settings", icon: Settings, disabled: true, badge: "Soon" },
];
