import { Link, useLocation } from "react-router";
import { 
  LayoutDashboard, 
  Calendar, 
  CalendarDays, 
  GraduationCap, 
  FileCheck2, 
  BookOpen, 
  Settings,
  Orbit
} from "lucide-react";
import { cn } from "./ui/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Generate Schedule", href: "/generate-schedule", icon: Calendar },
  { name: "Schedule Builder", href: "/schedule-builder", icon: CalendarDays },
  { name: "Four-Year Plan", href: "/four-year-plan", icon: GraduationCap },
  { name: "Degree Audit", href: "/degree-audit", icon: FileCheck2 },
  { name: "Gen Eds", href: "/gen-eds", icon: BookOpen },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <Link to="/dashboard" className="flex items-center gap-2">
          <Orbit className="w-8 h-8 text-red-500" />
          <span className="text-2xl tracking-tight text-foreground" style={{ 
            textShadow: "0 0 20px rgba(239, 68, 68, 0.3)"
          }}>
            OrbitUMD
          </span>
        </Link>
      </div>
      
      <nav className="flex-1 p-4 space-y-1">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                isActive
                  ? "bg-red-600/20 text-red-400 border border-red-600/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-sm">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}