import { useNavigate } from "react-router";
import { Calendar, CalendarDays, GraduationCap, FileCheck2, Orbit } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";

const goals = [
  {
    id: "generate",
    title: "Generate Schedule",
    label: "Quick · Like UMD's Venus",
    icon: Calendar,
    description: "Already know which classes you want? Plug them in and let OrbitUMD generate possible schedules — just like Venus, but cleaner. Filter by days, times, and format, then pick the schedule that fits your life.",
    route: "/generate-schedule",
    color: "text-blue-400 border-blue-600/30 bg-blue-600/10"
  },
  {
    id: "explore",
    title: "Build My Week",
    label: "Interactive · Calendar View",
    icon: CalendarDays,
    description: "Search UMD courses, drag them onto a weekly calendar, and experiment with different combinations before you commit. Perfect for exploring what's even possible this term.",
    route: "/build-my-week",
    color: "text-green-400 border-green-600/30 bg-green-600/10"
  },
  {
    id: "plan",
    title: "Make a Four-Year Plan",
    label: "Guided · Full Degree Planner",
    icon: GraduationCap,
    description: "Map out your entire degree — Gen Eds, majors, minors, and electives — across every semester. We'll walk you through your credits, requirements, and a clean four-year plan view.",
    route: "/credit-import",
    color: "text-purple-400 border-purple-600/30 bg-purple-600/10"
  },
  {
    id: "audit",
    title: "View My Degree Audit",
    label: "Overview · Progress Snapshot",
    icon: FileCheck2,
    description: "See a clear, interactive view of what you've completed, what's in progress, and what's left. Click any requirement to see course options or jump directly into planning.",
    route: "/degree-audit",
    color: "text-amber-400 border-amber-600/30 bg-amber-600/10"
  }
];

export default function GoalSelection() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-2 mb-12 justify-center">
          <Orbit className="w-8 h-8 text-red-500" />
          <span className="text-2xl text-foreground">OrbitUMD</span>
        </div>

        <div className="text-center mb-12">
          <h1 className="text-4xl text-foreground mb-4">What's your goal right now?</h1>
          <p className="text-muted-foreground max-w-3xl mx-auto">
            OrbitUMD can be as lightweight or as in‑depth as you need. Pick what you want to do today. 
            You can always explore the other options later.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {goals.map((goal) => {
            const Icon = goal.icon;
            return (
              <Card
                key={goal.id}
                onClick={() => navigate(goal.route)}
                className={`p-6 bg-card border-border hover:border-neutral-600 cursor-pointer transition-all hover:scale-[1.02] ${goal.color}`}
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-input-background border border-border">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-xl text-foreground">{goal.title}</h3>
                      <Badge variant="outline" className="text-xs border-border">
                        {goal.label}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {goal.description}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="text-center">
          <button
            onClick={() => navigate("/dashboard")}
            className="text-muted-foreground hover:text-foreground/80 text-sm underline"
          >
            Skip for now, take me to the dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
