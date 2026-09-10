import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, Briefcase, FileText, Settings, GraduationCap, Users, FileSignature, Radar } from "lucide-react";

export interface NavLink {
  label: string;
  href: string;
  icon: LucideIcon;
  disabled?: boolean;
  badge?: string;
}

export const navLinks: NavLink[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Job Pipeline", href: "/jobs", icon: Briefcase },
  { label: "Discovery", href: "/discovery", icon: Radar },
  { label: "Resume Library", href: "/resumes", icon: FileText },
  { label: "Interview Prep", href: "/interview-prep", icon: GraduationCap },
  { label: "Recruiters", href: "/recruiters", icon: Users },
  { label: "Contracts", href: "/contracts", icon: FileSignature },
  { label: "Settings", href: "/settings", icon: Settings, disabled: true, badge: "Soon" },
];
