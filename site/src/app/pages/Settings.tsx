import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { User, Mail, GraduationCap, Calendar, Settings2, Moon, Sun, Edit } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Separator } from "../components/ui/separator";
import { useTheme } from "../contexts/ThemeContext";
import { Link } from "react-router";

export default function Settings() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-4xl mb-2">Settings</h1>
          <p className="text-muted-foreground">Manage your profile and academic preferences</p>
        </div>

        <div className="space-y-6">
          {/* Appearance */}
          <Card className="p-6 bg-card border-border">
            <div className="flex items-center gap-2 mb-6">
              {theme === 'dark' ? (
                <Moon className="w-5 h-5 text-purple-400" />
              ) : (
                <Sun className="w-5 h-5 text-amber-500" />
              )}
              <h2 className="text-2xl">Appearance</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="theme-toggle">Dark Mode</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Toggle between light and dark theme
                  </p>
                </div>
                <Switch
                  id="theme-toggle"
                  checked={theme === 'dark'}
                  onCheckedChange={toggleTheme}
                />
              </div>
            </div>
          </Card>

          {/* Profile Information */}
          <Card className="p-6 bg-card border-border">
            <div className="flex items-center gap-2 mb-6">
              <User className="w-5 h-5 text-red-400" />
              <h2 className="text-2xl">Profile Information</h2>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  defaultValue="Jake Grischmann"
                  className="bg-input-background border-border"
                />
              </div>

              <div>
                <Label htmlFor="email">UMD Email</Label>
                <Input
                  id="email"
                  type="email"
                  defaultValue="jakefrischmann@gmail.com"
                  className="bg-input-background border-border"
                />
              </div>

              <div>
                <Label htmlFor="uid">UMD UID</Label>
                <Input
                  id="uid"
                  defaultValue="122214590"
                  className="bg-input-background border-border"
                />
              </div>

              <Button className="bg-primary hover:bg-primary/90">
                Save Profile Changes
              </Button>
            </div>
          </Card>

          {/* Academic Information */}
          <Card className="p-6 bg-card border-border">
            <div className="flex items-center gap-2 mb-6">
              <GraduationCap className="w-5 h-5 text-blue-400" />
              <h2 className="text-2xl">Academic Information</h2>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Degree Type</Label>
                <Select defaultValue="dual">
                  <SelectTrigger className="bg-input-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bs">Bachelor of Science (B.S.)</SelectItem>
                    <SelectItem value="ba">Bachelor of Arts (B.A.)</SelectItem>
                    <SelectItem value="dual">Dual-Degree</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Primary Major</Label>
                <Select defaultValue="cmsc">
                  <SelectTrigger className="bg-input-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cmsc">Computer Science</SelectItem>
                    <SelectItem value="phys">Physics</SelectItem>
                    <SelectItem value="math">Mathematics</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-2 block">Additional Majors & Minors</Label>
                <div className="flex flex-wrap gap-2 mb-3">
                  <Badge className="bg-blue-600/20 text-blue-400 border border-blue-600/30">
                    Physics (Minor)
                  </Badge>
                </div>
                <Button variant="outline" size="sm" className="border-border hover:bg-accent">
                  Add Major/Minor
                </Button>
              </div>

              <Separator className="bg-border" />

              <div>
                <Label>Expected Graduation</Label>
                <Select defaultValue="spring2029">
                  <SelectTrigger className="bg-input-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spring2029">Spring 2029</SelectItem>
                    <SelectItem value="fall2028">Fall 2028</SelectItem>
                    <SelectItem value="spring2028">Spring 2028</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator className="bg-border" />

              <div>
                <Label className="mb-2 block">Degree Requirements</Label>
                <p className="text-xs text-muted-foreground mb-3">
                  Customize your major and minor requirements with AND/OR course groupings
                </p>
                <Link to="/degree-requirements">
                  <Button variant="outline" size="sm" className="border-border hover:bg-accent">
                    <Edit className="w-4 h-4 mr-2" />
                    Open Degree Requirements Builder
                  </Button>
                </Link>
              </div>

              <Button className="bg-primary hover:bg-primary/90">
                Save Academic Changes
              </Button>
            </div>
          </Card>

          {/* Preferences */}
          <Card className="p-6 bg-card border-border">
            <div className="flex items-center gap-2 mb-6">
              <Settings2 className="w-5 h-5 text-purple-400" />
              <h2 className="text-2xl">Preferences</h2>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Default Term</Label>
                <Select defaultValue="fall2027">
                  <SelectTrigger className="bg-input-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fall2027">Fall 2027</SelectItem>
                    <SelectItem value="spring2027">Spring 2027</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  The term that will be selected by default in schedule generators
                </p>
              </div>

              <div>
                <Label>Schedule View Preference</Label>
                <Select defaultValue="weekly">
                  <SelectTrigger className="bg-input-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly Calendar</SelectItem>
                    <SelectItem value="list">List View</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          {/* Data Management */}
          <Card className="p-6 bg-card border-border">
            <div className="flex items-center gap-2 mb-6">
              <Mail className="w-5 h-5 text-amber-400" />
              <h2 className="text-2xl">Data Management</h2>
            </div>

            <div className="space-y-3">
              <Button variant="outline" className="w-full border-border hover:bg-accent">
                Export My Data
              </Button>
              <Button variant="outline" className="w-full border-border hover:bg-accent">
                Import from Testudo
              </Button>
              <Button variant="outline" className="w-full border-red-700 text-red-400 hover:bg-red-600/10">
                Reset All Data
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}