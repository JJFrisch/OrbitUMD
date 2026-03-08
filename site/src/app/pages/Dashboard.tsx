import { Link } from "react-router";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  ArrowRight,
  Info
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";

export default function Dashboard() {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl mb-2">Welcome back, Jake!</h1>
        <p className="text-muted-foreground">Here's your academic overview</p>
      </div>

      {/* Next Semester Status */}
      <Card className="p-6 bg-card border-border mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-2xl">Spring 2027 Status</h2>
              <Badge variant="outline" className="bg-blue-600/20 text-blue-400 border-blue-600/30">
                In Progress
              </Badge>
            </div>
            <p className="text-muted-foreground">5 courses · 16 credits</p>
          </div>
          <Link to="/schedule-builder">
            <Button className="bg-primary hover:bg-primary/90">
              View Schedule
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-input-background rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <span className="text-sm text-muted-foreground">Registered</span>
            </div>
            <p className="text-2xl">3 courses</p>
          </div>
          <div className="p-4 bg-input-background rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-amber-400" />
              <span className="text-sm text-muted-foreground">Waitlisted</span>
            </div>
            <p className="text-2xl">1 course</p>
          </div>
          <div className="p-4 bg-input-background rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-blue-400" />
              <span className="text-sm text-muted-foreground">Planned</span>
            </div>
            <p className="text-2xl">1 course</p>
          </div>
        </div>
      </Card>

      {/* Requirements Snapshot */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card className="p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl">General Education Progress</h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="bg-popover border-border">
                  <p>Track your progress through UMD's Gen Ed requirements</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">Fundamental Studies</span>
                <span className="text-sm">4 / 5</span>
              </div>
              <Progress value={80} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">Distributive Studies</span>
                <span className="text-sm">6 / 8</span>
              </div>
              <Progress value={75} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">I-Series</span>
                <span className="text-sm">2 / 2</span>
              </div>
              <Progress value={100} className="h-2 [&>div]:bg-green-500" />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">Diversity</span>
                <span className="text-sm">2 / 3</span>
              </div>
              <Progress value={66} className="h-2" />
            </div>
          </div>

          <Link to="/gen-eds">
            <Button variant="outline" className="w-full mt-4 border-border hover:bg-accent">
              View Detailed Gen Eds
            </Button>
          </Link>
        </Card>

        <Card className="p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl">Computer Science Major</h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="bg-popover border-border">
                  <p>Track your major requirements and progress</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">Lower Level Core</span>
                <span className="text-sm">4 / 4</span>
              </div>
              <Progress value={100} className="h-2 [&>div]:bg-green-500" />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">Upper Level Core</span>
                <span className="text-sm">3 / 5</span>
              </div>
              <Progress value={60} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">Upper Level Electives</span>
                <span className="text-sm">2 / 4</span>
              </div>
              <Progress value={50} className="h-2" />
            </div>
          </div>

          <Link to="/degree-audit">
            <Button variant="outline" className="w-full mt-4 border-border hover:bg-accent">
              View Full Degree Audit
            </Button>
          </Link>
        </Card>
      </div>

      {/* Suggested Next Steps */}
      <Card className="p-6 bg-card border-border">
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle className="w-5 h-5 text-amber-400" />
          <h3 className="text-xl">Suggested Next Steps</h3>
        </div>

        <div className="space-y-3">
          <div className="p-4 bg-input-background rounded-lg border border-amber-600/30 flex items-center justify-between">
            <div>
              <p className="mb-1">Complete your Physics major requirements</p>
              <p className="text-sm text-muted-foreground">You haven't set up requirements for your second major yet</p>
            </div>
            <Link to="/degree-requirements">
              <Button variant="outline" className="border-amber-600/50 text-amber-400 hover:bg-amber-600/10">
                Set Up Now
              </Button>
            </Link>
          </div>

          <div className="p-4 bg-input-background rounded-lg border border-blue-600/30 flex items-center justify-between">
            <div>
              <p className="mb-1">Plan Fall 2027 classes</p>
              <p className="text-sm text-muted-foreground">Start thinking about your schedule for next semester</p>
            </div>
            <Link to="/generate-schedule">
              <Button variant="outline" className="border-blue-600/50 text-blue-400 hover:bg-blue-600/10">
                Generate Schedule
              </Button>
            </Link>
       import { Link } from "react-router";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  ArrowRight,
  Info
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";

export default function Dashboard() {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl mb-2">Welcome back, Jake!</h1>
        <p className="text-muted-foreground">Here's your academic overview</p>
      </div>

      {/* Next Semester Status */}
      <Card className="p-6 bg-card border-border mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-2xl">Spring 2027 Status</h2>
              <Badge variant="outline" className="bg-blue-600/20 text-blue-400 border-blue-600/30">
                In Progress
              </Badge>
            </div>
            <p className="text-muted-foreground">5 courses · 16 credits</p>
          </div>
          <Link to="/schedule-builder">
            <Button className="bg-primary hover:bg-primary/90">
              View Schedule
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-input-background rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <span className="text-sm text-muted-foreground">Registered</span>
            </div>
            <p className="text-2xl">3 courses</p>
          </div>
          <div className="p-4 bg-input-background rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-amber-400" />
              <span className="text-sm text-muted-foreground">Waitlisted</span>
            </div>
            <p className="text-2xl">1 course</p>
          </div>
          <div className="p-4 bg-input-background rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-blue-400" />
              <span className="text-sm text-muted-foreground">Planned</span>
            </div>
            <p className="text-2xl">1 course</p>
          </div>
        </div>
      </Card>

      {/* Requirements Snapshot */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card className="p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl">General Education Progress</h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="bg-popover border-border">
                  <p>Track your progress through UMD's Gen Ed requirements</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">Fundamental Studies</span>
                <span className="text-sm">4 / 5</span>
              </div>
              <Progress value={80} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">Distributive Studies</span>
                <span className="text-sm">6 / 8</span>
              </div>
              <Progress value={75} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">I-Series</span>
                <span className="text-sm">2 / 2</span>
              </div>
              <Progress value={100} className="h-2 [&>div]:bg-green-500" />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">Diversity</span>
                <span className="text-sm">2 / 3</span>
              </div>
              <Progress value={66} className="h-2" />
            </div>
          </div>

          <Link to="/gen-eds">
            <Button variant="outline" className="w-full mt-4 border-border hover:bg-accent">
              View Detailed Gen Eds
            </Button>
          </Link>
        </Card>

        <Card className="p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl">Computer Science Major</h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="bg-popover border-border">
                  <p>Track your major requirements and progress</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">Lower Level Core</span>
                <span className="text-sm">4 / 4</span>
              </div>
              <Progress value={100} className="h-2 [&>div]:bg-green-500" />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">Upper Level Core</span>
                <span className="text-sm">3 / 5</span>
              </div>
              <Progress value={60} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">Upper Level Electives</span>
                <span className="text-sm">2 / 4</span>
              </div>
              <Progress value={50} className="h-2" />
            </div>
          </div>

          <Link to="/degree-audit">
            <Button variant="outline" className="w-full mt-4 border-border hover:bg-accent">
              View Full Degree Audit
            </Button>
          </Link>
        </Card>
      </div>

      {/* Suggested Next Steps */}
      <Card className="p-6 bg-card border-border">
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle className="w-5 h-5 text-amber-400" />
          <h3 className="text-xl">Suggested Next Steps</h3>
        </div>

        <div className="space-y-3">
          <div className="p-4 bg-input-background rounded-lg border border-amber-600/30 flex items-center justify-between">
            <div>
              <p className="mb-1">Complete your Physics major requirements</p>
              <p className="text-sm text-muted-foreground">You haven't set up requirements for your second major yet</p>
            </div>
            <Link to="/degree-requirements">
              <Button variant="outline" className="border-amber-600/50 text-amber-400 hover:bg-amber-600/10">
                Set Up Now
              </Button>
            </Link>
          </div>

          <div className="p-4 bg-input-background rounded-lg border border-blue-600/30 flex items-center justify-between">
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

          <div className="p-4 bg-input-background rounded-lg border border-green-600/30 flex items-center justify-between">
            <div>
              <p className="mb-1">Review your four-year plan</p>
              <p className="text-sm text-muted-foreground">Make sure you're on track to graduate on time</p>
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
}   </div>

          <div className="p-4 bg-input-background rounded-lg border border-green-600/30 flex items-center justify-between">
            <div>
              <p className="mb-1">Review your four-year plan</p>
              <p className="text-sm text-muted-foreground">Make sure you're on track to graduate on time</p>
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