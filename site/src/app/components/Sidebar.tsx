import { useEffect, useRef, useState } from "react";
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
import { cn } from "./ui/utils";
import "./sidebar-template.css";

const navigationSections = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "My Four-Year Plan", href: "/four-year-plan", icon: GraduationCap },
    ],
  },
  {
    label: "Scheduling",
    items: [
      { name: "Generate Schedule", href: "/generate-schedule", icon: Calendar },
      { name: "My Schedules", href: "/schedules", icon: CalendarDays, badge: "8" },
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const userDisplay = "Student";
  const userInitials = userDisplay
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((token) => token[0]?.toUpperCase() ?? "")
    .join("") || "ST";

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!settingsMenuRef.current) return;
      if (!settingsMenuRef.current.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    };

    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEsc);
    };
  }, []);

  useEffect(() => {
    setSettingsOpen(false);
  }, [location.pathname]);

  return (
    <aside className={cn("orbit-sidebar", collapsed && "collapsed")}>
      <div className="sidebar-header">
        <Link to="/dashboard" className="sidebar-logo" aria-label="OrbitUMD dashboard" title={collapsed ? "OrbitUMD" : undefined}>
          <span className="sidebar-logo-mark" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
              <circle cx="12" cy="12" r="3" stroke="#EF5350" strokeWidth="2" />
              <circle cx="19" cy="5" r="2" stroke="#EF5350" strokeWidth="2" />
              <circle cx="5" cy="19" r="2" stroke="#EF5350" strokeWidth="2" />
              <path d="M10.4 21.9a10 10 0 0 0 9.941-15.416" stroke="#EF5350" strokeWidth="2" strokeDasharray="3 2" strokeLinejoin="round" />
              <path d="M13.5 2.1a10 10 0 0 0-9.841 15.416" stroke="#EF5350" strokeWidth="2" strokeDasharray="3 2" strokeLinejoin="round" />
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
                  {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-user-wrap" ref={settingsMenuRef}>
        <button
          type="button"
          className="sidebar-user"
          title={collapsed ? "Settings" : undefined}
          aria-label="Open account menu"
          onClick={() => setSettingsOpen((prev) => !prev)}
        >
          <div className="user-avatar">{userInitials}</div>
          <div className="user-info">
            <div className="user-name">{userDisplay}</div>
            <div className="user-role">Profile menu</div>
          </div>
          <span className="user-menu-caret" aria-hidden>
            {settingsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </button>

        {settingsOpen && (
          <div className="sidebar-user-menu" aria-label="Account menu">
            <Link to="/settings" className="sidebar-user-menu-item">
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}