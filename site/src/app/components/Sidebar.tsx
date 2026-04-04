import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
import {
  LayoutDashboard,
  CalendarDays,
  GraduationCap,
  FileCheck2,
  BookOpen,
  Bell,
  Lightbulb,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "./ui/utils";
import { getSupabaseClient } from "@/lib/supabase/client";
import { countUnreadNotifications } from "@/lib/repositories/notificationsRepository";
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
      { name: "Schedules", href: "/schedules", icon: CalendarDays },
    ],
  },
  {
    label: "Requirements",
    items: [
      { name: "Degree Audit", href: "/degree-audit", icon: FileCheck2 },
      { name: "Gen Eds", href: "/gen-eds", icon: BookOpen },
      { name: "Suggestions", href: "/suggestions", icon: Lightbulb },
      { name: "Notifications", href: "/notifications", icon: Bell },
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
  const [unreadNotifications, setUnreadNotifications] = useState(0);

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

  useEffect(() => {
    let active = true;

    const loadUnread = async () => {
      try {
        const count = await countUnreadNotifications();
        if (!active) return;
        setUnreadNotifications(count);
      } catch {
        if (!active) return;
        setUnreadNotifications(0);
      }
    };

    void loadUnread();
    const interval = window.setInterval(() => {
      void loadUnread();
    }, 30000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [location.pathname]);

  const navSections = useMemo(() => {
    return navigationSections.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        if (item.href !== "/notifications") return item;
        return {
          ...item,
          badge: unreadNotifications > 0 ? String(unreadNotifications) : undefined,
        };
      }),
    }));
  }, [unreadNotifications]);

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
            <svg width="34" height="34" viewBox="0 0 100 100" fill="none" className="orbit-logo-svg">
              {/* Core planet */}
              <circle className="orbit-core" cx="50" cy="50" r="14" fill="url(#logoCore)" />
              <circle cx="50" cy="50" r="14" fill="url(#coreSheen)" />
              {/* Single orbit path — tilted ellipse */}
              <ellipse className="orbit-ring" cx="50" cy="50" rx="44" ry="18" transform="rotate(-30 50 50)" />
              {/* Satellite — follows the ring */}
              <circle className="orbit-sat" r="5" fill="url(#logoSat)">
                <animateMotion dur="4s" repeatCount="indefinite">
                  <mpath href="#logoOrbitPath" />
                </animateMotion>
              </circle>
              <defs>
                <path id="logoOrbitPath" d="M94,45 A44,18 -30 1,1 93.99,40.99 Z" transform="rotate(-30 50 50)" />
                <radialGradient id="logoCore" cx="38%" cy="36%">
                  <stop offset="0%" stopColor="#FF8A80" />
                  <stop offset="100%" stopColor="#C62828" />
                </radialGradient>
                <radialGradient id="coreSheen" cx="34%" cy="30%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
                  <stop offset="50%" stopColor="rgba(255,255,255,0)" />
                </radialGradient>
                <radialGradient id="logoSat" cx="36%" cy="34%">
                  <stop offset="0%" stopColor="#FFE082" />
                  <stop offset="100%" stopColor="#FFA000" />
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

      <nav className="nav-section" aria-label="Primary">
        {navSections.map((section) => (
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
                  aria-current={isActive ? "page" : undefined}
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
            <div className="user-role">Account settings</div>
          </div>
          <span className="user-menu-caret" aria-hidden>
            <ChevronDown className="w-4 h-4" />
          </span>
        </Link>
      </div>
    </aside>
  );
}