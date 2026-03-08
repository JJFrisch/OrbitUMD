import { Link } from "react-router";
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Info,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";

export default function Dashboard() {
  return (
    <div className="mx-auto max-w-7xl p-8">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl">Welcome back, Jake!</h1>
        <p className="text-muted-foreground">Here&apos;s your academic overview</p>
      </div>

      <Card className="mb-6 border-border bg-card p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-2xl">Spring 2027 Status</h2>
              <Badge variant="outline" className="border-blue-600/30 bg-blue-600/20 text-blue-400">
                In Progress
              </Badge>
            </div>
            <p className="text-muted-foreground">5 courses · 16 credits</p>
          </div>
          <Link to="/schedule-builder">
            <Button className="bg-primary hover:bg-primary/90">
              View Schedule
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-input-background p-4">
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-400" />
              <span className="text-sm text-muted-foreground">Registered</span>
            </div>
            <p className="text-2xl">3 courses</p>
          </div>
          <div className="rounded-lg border border-border bg-input-background p-4">
            <div className="mb-2 flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-400" />
              <span className="text-sm text-muted-foreground">Waitlisted</span>
            </div>
            <p className="text-2xl">1 course</p>
          </div>
          <div className="rounded-lg border border-border bg-input-background p-4">
            <div className="mb-2 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-400" />
              <span className="text-sm text-muted-foreground">Planned</span>
            </div>
            <p className="text-2xl">1 course</p>
          </div>
        </div>
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl">General Education Progress</h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 cursor-help text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="border-border bg-popover">
                  <p>Track your progress through UMD&apos;s Gen Ed requirements</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="space-y-4">
            <div>
              <div className="mb-2 flex justify-between">
                <span className="text-sm text-muted-foreground">Fundamental Studies</span>
                <span className="text-sm">4 / 5</span>
              </div>
              <Progress value={80} className="h-2" />
            </div>
            <div>
              <div className="mb-2 flex justify-between">
                <span className="text-sm text-muted-foreground">Distributive Studies</span>
                <span className="text-sm">6 / 8</span>
              </div>
              <Progress value={75} className="h-2" />
            </div>
            <div>
              <div className="mb-2 flex justify-between">
                <span className="text-sm text-muted-foreground">I-Series</span>
                <span className="text-sm">2 / 2</span>
              </div>
              <Progress value={100} className="h-2 [&>div]:bg-green-500" />
            </div>
            <div>
              <div className="mb-2 flex justify-between">
                <span className="text-sm text-muted-foreground">Diversity</span>
                <span className="text-sm">2 / 3</span>
              </div>
              <Progress value={66} className="h-2" />
            </div>
          </div>

          <Link to="/gen-eds">
            <Button variant="outline" className="mt-4 w-full border-border hover:bg-accent">
              View Detailed Gen Eds
            </Button>
          </Link>
        </Card>

        <Card className="border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl">Computer Science Major</h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 cursor-help text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="border-border bg-popover">
                  <p>Track your major requirements and progress</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="space-y-4">
            <div>
              <div className="mb-2 flex justify-between">
                <span className="text-sm text-muted-foreground">Lower Level Core</span>
                <span className="text-sm">4 / 4</span>
              </div>
              <Progress value={100} className="h-2 [&>div]:bg-green-500" />
            </div>
            <div>
              <div className="mb-2 flex justify-between">
                <span className="text-sm text-muted-foreground">Upper Level Core</span>
                <span className="text-sm">3 / 5</span>
              </div>
              <Progress value={60} className="h-2" />
            </div>
            <div>
              <div className="mb-2 flex justify-between">
                <span className="text-sm text-muted-foreground">Upper Level Electives</span>
                <span className="text-sm">2 / 4</span>
              </div>
              <Progress value={50} className="h-2" />
            </div>
          </div>

          <Link to="/degree-audit">
            <Button variant="outline" className="mt-4 w-full border-border hover:bg-accent">
              View Full Degree Audit
            </Button>
          </Link>
        </Card>
      </div>

      <Card className="border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-amber-400" />
          <h3 className="text-xl">Suggested Next Steps</h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-amber-600/30 bg-input-background p-4">
            <div>
              <p className="mb-1">Complete your Physics major requirements</p>
              <p className="text-sm text-muted-foreground">
                You haven&apos;t set up requirements for your second major yet
              </p>
            </div>
            <Link to="/degree-requirements">
              <Button variant="outline" className="border-amber-600/50 text-amber-400 hover:bg-amber-600/10">
                Set Up Now
              </Button>
            </Link>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-blue-600/30 bg-input-background p-4">
            <div>
              <p className="mb-1">Plan Fall 2027 classes</p>
              <p className="text-sm text-muted-foreground">Start thinking about your schedule for next semester</p>
            </div>
            <Link to="/generate-schedule">
              <Button variant="outline" className="border-blue-600/50 text-blue-400 hover:bg-blue-600/10">
                Generate Schedule
              </Button>
            </Link>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-green-600/30 bg-input-background p-4">
            <div>
              <p className="mb-1">Review your four-year plan</p>
              <p className="text-sm text-muted-foreground">Make sure you&apos;re on track to graduate on time</p>
            </div>
            <Link to="/four-year-plan">
              <Button variant="outline" className="border-green-600/50 text-green-400 hover:bg-green-600/10">
                View Plan
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
