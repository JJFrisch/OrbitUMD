import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import {
  LayoutDashboard,
  Calendar,
  CalendarDays,
  GraduationCap,
  FileCheck2,
  BookOpen,
  Settings,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "./ui/utils";
import { getSupabaseClient } from "@/lib/supabase/client";
import "./sidebar-template.css";

interface NavigationItem {
  name: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}

interface NavigationSection {
  label: string;
  items: NavigationItem[];
}

const navigationSections: NavigationSection[] = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "My Four-Year Plan", href: "/four-year-plan", icon: GraduationCap },
  //   ], 
  // },
  // { 
  //   label: "Scheduling",
  //   items: [ 
      // { name: "Generate Schedule", href: "/generate-schedule", icon: Calendar },
      { name: "Schedules", href: "/schedules", icon: CalendarDays },
    ],
  },
  {
    label: "Requirements",
    items: [
      { name: "Degree Audit", href: "/degree-audit", icon: FileCheck2 },
      { name: "Gen Eds", href: "/gen-eds", icon: BookOpen },
      { name: "Suggestions", href: "/suggestions", icon: Lightbulb },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const location = useLocation();
  const [userDisplay, setUserDisplay] = useState("Student");

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();

    const loadUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !active) return;

        const { data: profile } = await supabase
          .from("user_profiles")
          .select("display_name")
          .eq("id", user.id)
          .maybeSingle();

        const name =
          String(profile?.display_name ?? "").trim()
          || (user.user_metadata?.full_name as string | undefined)
          || (user.user_metadata?.name as string | undefined)
          || user.email
          || "Student";

        if (active) setUserDisplay(name);
      } catch {
        // keep default "Student"
      }
    };

    void loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "SIGNED_OUT") {
        setUserDisplay("Student");
      } else if (session?.user) {
        void loadUser();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const userInitials = userDisplay
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((token) => token[0]?.toUpperCase() ?? "")
    .join("") || "ST";

  return (
    <aside className={cn("orbit-sidebar", collapsed && "collapsed")}>
      <div className="sidebar-header">
        <Link to="/dashboard" className="sidebar-logo" aria-label="OrbitUMD dashboard" title={collapsed ? "OrbitUMD" : undefined}>
          <span className="sidebar-logo-mark" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 100 100" fill="none" className="orbit-logo-svg">
              {/* Outer orbit ring */}
              <ellipse className="orbit-ring orbit-ring-1" cx="50" cy="50" rx="42" ry="16" stroke="rgba(239,83,80,0.25)" strokeWidth="1.5" />
              {/* Inner orbit ring (tilted via transform) */}
              <ellipse className="orbit-ring orbit-ring-2" cx="50" cy="50" rx="42" ry="16" stroke="rgba(239,83,80,0.2)" strokeWidth="1.5" transform="rotate(60 50 50)" />
              {/* Third orbit ring */}
              <ellipse className="orbit-ring orbit-ring-3" cx="50" cy="50" rx="42" ry="16" stroke="rgba(239,83,80,0.15)" strokeWidth="1.5" transform="rotate(120 50 50)" />
              {/* Core body — glowing center */}
              <circle cx="50" cy="50" r="8" fill="#EF5350" className="orbit-core" />
              <circle cx="50" cy="50" r="8" fill="url(#coreGlow)" className="orbit-core-glow" />
              {/* Orbiting satellites */}
              <circle className="orbit-sat orbit-sat-1" r="3.5" fill="#FFC107">
                <animateMotion dur="6s" repeatCount="indefinite" rotate="auto">
                  <mpath href="#orbit-path-1" />
                </animateMotion>
              </circle>
              <circle className="orbit-sat orbit-sat-2" r="2.5" fill="#EF5350">
                <animateMotion dur="8s" repeatCount="indefinite" rotate="auto" begin="-3s">
                  <mpath href="#orbit-path-2" />
                </animateMotion>
              </circle>
              <circle className="orbit-sat orbit-sat-3" r="2" fill="rgba(255,255,255,0.7)">
                <animateMotion dur="10s" repeatCount="indefinite" rotate="auto" begin="-5s">
                  <mpath href="#orbit-path-3" />
                </animateMotion>
              </circle>
              {/* Hidden motion paths for satellites */}
              <defs>
                <ellipse id="orbit-path-1" cx="50" cy="50" rx="42" ry="16" />
                <ellipse id="orbit-path-2" cx="50" cy="50" rx="42" ry="16" transform="rotate(60 50 50)" />
                <ellipse id="orbit-path-3" cx="50" cy="50" rx="42" ry="16" transform="rotate(120 50 50)" />
                <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#FFCDD2" stopOpacity="0.8" />
                  <stop offset="60%" stopColor="#EF5350" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#C62828" stopOpacity="0" />
                </radialGradient>
              </defs>
            </svg>
          </span>
          <span className="logo-text">Orbit<span>UMD</span></span>
        </Link>

        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={onToggleCollapse}
          className="sidebar-collapse-btn"
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>


      </div>

      <nav className="nav-section">
        {navigationSections.map((section) => (
          <div key={section.label} className="nav-group">
            <div className="nav-label">{section.label}</div>
            {section.items.map((item) => {
              const isSchedulesTab = item.href === "/schedules";
              const isActive = isSchedulesTab
                ? location.pathname === "/schedules" || location.pathname === "/schedule-builder" || location.pathname === "/build-my-week"
                : location.pathname === item.href;

              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn("nav-item", isActive && "active")}
                  title={collapsed ? item.name : undefined}
                >
                  <item.icon className="nav-icon" />
                  <span className="nav-text">{item.name}</span>
                  {item.badge != null ? <span className="nav-badge">{item.badge}</span> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-user-wrap">
        <Link
          className="sidebar-user"
          title={collapsed ? "Settings" : undefined}
          aria-label="Open settings"
          to="/settings"
        >
          <div className="user-avatar">{userInitials}</div>
          <div className="user-info">
            <div className="user-name">{userDisplay}</div>
            <div className="user-role">Profile menu</div>
          </div>
          <span className="user-menu-caret" aria-hidden>
            <ChevronDown className="w-4 h-4" />
          </span>
        </Link>
      </div>
    </aside>
  );
}