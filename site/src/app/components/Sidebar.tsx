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
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";
import { cn } from "./ui/utils";
import "./sidebar-template.css";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Generate Schedule", href: "/generate-schedule", icon: Calendar },
  { name: "Schedules", href: "/schedules", icon: CalendarDays },
  { name: "Four-Year Plan", href: "/four-year-plan", icon: GraduationCap },
  { name: "Degree Audit", href: "/degree-audit", icon: FileCheck2 },
  { name: "Gen Eds", href: "/gen-eds", icon: BookOpen },
  { name: "Suggestions", href: "/suggestions", icon: Lightbulb },
  { name: "Settings", href: "/settings", icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const location = useLocation();
  const userDisplay = "Student";
  const userInitials = userDisplay
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((token) => token[0]?.toUpperCase() ?? "")
    .join("") || "ST";

  return (
    <aside className={cn("orbit-sidebar", collapsed && "collapsed")}>
      <div className="sidebar-header">
        <Link to="/dashboard" className="sidebar-logo" aria-label="OrbitUMD dashboard">
          <span className="logo-text">Orbit<span>UMD</span></span>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="3" stroke="#EF5350" strokeWidth="2" />
            <circle cx="19" cy="5" r="2" stroke="#EF5350" strokeWidth="2" />
            <circle cx="5" cy="19" r="2" stroke="#EF5350" strokeWidth="2" />
            <path d="M10.4 21.9a10 10 0 0 0 9.941-15.416" stroke="#EF5350" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13.5 2.1a10 10 0 0 0-9.841 15.416" stroke="#EF5350" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
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
        <div className="nav-label">Overview</div>
        {navigation.map((item) => {
          const isSchedulesTab = item.href === "/schedules";
          const isActive = isSchedulesTab
            ? location.pathname === "/schedules" || location.pathname === "/schedule-builder" || location.pathname === "/build-my-week"
            : location.pathname === item.href;

          const showBadge = item.name === "Generate Schedule" ? "3" : item.name === "Gen Eds" ? "2" : null;

          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn("nav-item", isActive && "active")}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className="nav-icon" />
              <span className="nav-text">{item.name}</span>
              {showBadge ? <span className="nav-badge">{showBadge}</span> : null}
            </Link>
          );
        })}
      </nav>

      <Link to="/settings" className="sidebar-user" title={collapsed ? "Settings" : undefined}>
        <div className="user-avatar">{userInitials}</div>
        <div className="user-info">
          <div className="user-name">{userDisplay}</div>
          <div className="user-role">Account settings</div>
        </div>
      </Link>
    </aside>
  );
}