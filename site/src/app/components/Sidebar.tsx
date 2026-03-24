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
import { Button } from "./ui/button";

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

  return (
    <aside className={cn(
      "bg-card border-r border-border flex flex-col transition-all duration-200 h-screen sticky top-0 overflow-y-auto",
      collapsed ? "w-20" : "w-64"
    )}>
      <div className={cn("border-b border-border", collapsed ? "p-3" : "p-6")}>
        <div className={cn("flex items-center gap-2", collapsed ? "justify-start" : "justify-between")}>
          <Link to="/dashboard" className="flex items-center gap-2 min-w-0">
            <img src="/orbit-swirl.svg" alt="OrbitUMD logo" className="w-8 h-8 shrink-0" />
            {!collapsed && (
              <span className="text-2xl tracking-tight text-foreground truncate [text-shadow:0_0_20px_rgba(239,68,68,0.3)]">
                OrbitUMD
              </span>
            )}
          </Link>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={onToggleCollapse}
            className={cn("shrink-0", collapsed && "ml-2")}
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </Button>
        </div>
      </div>
      
      <nav className="flex-1 p-4 space-y-1">
        {navigation.map((item) => {
          const isSchedulesTab = item.href === "/schedules";
          const isActive = isSchedulesTab
            ? location.pathname === "/schedules" || location.pathname === "/schedule-builder" || location.pathname === "/build-my-week"
            : location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                collapsed && "justify-center px-2",
                isActive
                  ? "bg-red-600/20 text-red-400 border border-red-600/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className="w-5 h-5" />
              {!collapsed && <span className="text-sm">{item.name}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}