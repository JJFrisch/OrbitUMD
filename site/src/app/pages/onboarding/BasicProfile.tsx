import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card } from "../../components/ui/card";
import { Progress } from "../../components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Info, Orbit } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { Checkbox } from "../../components/ui/checkbox";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  addUserDegreeProgramFromCatalogOption,
  listProgramCatalogOptions,
  listUserDegreePrograms,
  type CatalogProgramOption,
} from "@/lib/repositories/degreeProgramsRepository";

export default function BasicProfile() {
  const navigate = useNavigate();
  const [isNewStudent, setIsNewStudent] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [uid, setUid] = useState("");
  const [majorOptions, setMajorOptions] = useState<CatalogProgramOption[]>([]);
  const [selectedMajorKey, setSelectedMajorKey] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const supabase = getSupabaseClient();
        const [options, existingPrograms] = await Promise.all([
          listProgramCatalogOptions(),
          listUserDegreePrograms(),
        ]);

        const majors = options.filter((option) => option.type === "major");
        if (mounted) {
          setMajorOptions(majors);
          const existingPrimary = existingPrograms.find((program) => program.isPrimary);
          const existingMatch = majors.find((option) => option.name.toLowerCase() === String(existingPrimary?.programName ?? "").toLowerCase());
          setSelectedMajorKey(existingMatch?.key ?? majors[0]?.key ?? "");
        }

        const { data: authData } = await supabase.auth.getUser();
        const authUser = authData.user;
        if (!authUser) {
          if (mounted) {
            setName(localStorage.getItem("orbitumd-onboarding-name") ?? "");
            setEmail(localStorage.getItem("orbitumd-onboarding-email") ?? "");
            setUid(localStorage.getItem("orbitumd-onboarding-uid") ?? "");
          }
          return;
        }

        const { data: profileRow } = await supabase
          .from("user_profiles")
          .select("display_name, email, university_uid")
          .eq("id", authUser.id)
          .maybeSingle();

        if (!mounted) return;
        setName(String(profileRow?.display_name ?? authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? ""));
        setEmail(String(profileRow?.email ?? authUser.email ?? ""));
        setUid(String(profileRow?.university_uid ?? ""));
      } catch {
        // Keep onboarding usable even when profile lookup fails.
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, []);

  const handleContinue = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const supabase = getSupabaseClient();
      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData.user;

      if (!authUser) {
        localStorage.setItem("orbitumd-onboarding-name", name.trim());
        localStorage.setItem("orbitumd-onboarding-email", email.trim());
        localStorage.setItem("orbitumd-onboarding-uid", uid.trim());
        if (selectedMajorKey) {
          localStorage.setItem("orbitumd-onboarding-major-key", selectedMajorKey);
        }
        navigate(isNewStudent ? "/onboarding/goals" : "/credit-import?onboarding=1");
        return;
      }

      const { error } = await supabase.from("user_profiles").upsert(
        {
          id: authUser.id,
          display_name: name.trim() || null,
          email: email.trim() || null,
          university_uid: uid.trim() || null,
        },
        { onConflict: "id" },
      );
      if (error) throw error;

      if (selectedMajorKey) {
        const selected = majorOptions.find((option) => option.key === selectedMajorKey);
        if (selected) {
          const existing = await listUserDegreePrograms();
          const alreadyHasMajor = existing.some((program) => (
            program.programName.toLowerCase() === selected.name.toLowerCase()
          ));

          if (!alreadyHasMajor) {
            await addUserDegreeProgramFromCatalogOption(selected);
          }
        }
      }

      setMessage("Profile saved.");
      navigate(isNewStudent ? "/onboarding/goals" : "/credit-import?onboarding=1");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <Orbit className="w-8 h-8 text-red-500" />
          <span className="text-2xl text-foreground">OrbitUMD</span>
        </div>

        <div className="mb-8">
          <p className="text-sm text-muted-foreground text-center mb-2">Step 1 of 4: Basic Info</p>
          <Progress value={25} className="h-2" />
        </div>

        <Card className="p-8 bg-card border-border">
          <div className="mb-6">
            <h2 className="text-3xl text-foreground mb-2">Let's get started</h2>
            <p className="text-muted-foreground">Tell us the basics so we can build the right plan for you.</p>
          </div>

          <div className="space-y-6">
            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" className="bg-input-background border-border" />
              <p className="text-xs text-muted-foreground mt-1">We'll use this to personalize your experience</p>
            </div>

            <div>
              <Label htmlFor="email">UMD Email</Label>
              <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="yourid@umd.edu" className="bg-input-background border-border" />
              <p className="text-xs text-muted-foreground mt-1">Your official university email address</p>
            </div>

            <div>
              <Label htmlFor="uid">UMD UID</Label>
              <Input id="uid" value={uid} onChange={(event) => setUid(event.target.value)} placeholder="123456789" className="bg-input-background border-border" />
              <p className="text-xs text-muted-foreground mt-1">Your 9-digit university ID number</p>
            </div>

            {message && (
              <p className="text-sm text-foreground/80">{message}</p>
            )}

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Label htmlFor="degree-type">Degree Type</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="bg-popover border-border">
                      <p>You can change this later in Settings</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select defaultValue="bs">
                <SelectTrigger className="bg-input-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bs">Bachelor of Science (B.S.)</SelectItem>
                  <SelectItem value="ba">Bachelor of Arts (B.A.)</SelectItem>
                  <SelectItem value="double">Double Degree</SelectItem>
                  <SelectItem value="second">Second Major</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Label htmlFor="primary-major">Primary Major</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="bg-popover border-border">
                      <p>This can be edited later</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select value={selectedMajorKey} onValueChange={setSelectedMajorKey}>
                <SelectTrigger className="bg-input-background border-border">
                  <SelectValue placeholder={majorOptions.length > 0 ? "Select your major" : "Loading majors..."} />
                </SelectTrigger>
                <SelectContent>
                  {majorOptions.map((option) => (
                    <SelectItem key={option.key} value={option.key}>{option.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Label htmlFor="starting-semester">Starting Semester</Label>
              </div>
              <Select defaultValue="fall2026">
                <SelectTrigger className="bg-input-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fall2026">Fall 2026</SelectItem>
                  <SelectItem value="spring2027">Spring 2027</SelectItem>
                  <SelectItem value="fall2027">Fall 2027</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="graduation-year">Expected Graduation Year (Optional)</Label>
              <Select>
                <SelectTrigger className="bg-input-background border-border">
                  <SelectValue placeholder="Select year..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2028">2028</SelectItem>
                  <SelectItem value="2029">2029</SelectItem>
                  <SelectItem value="2030">2030</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2 p-4 bg-input-background rounded-lg border border-border">
              <Checkbox 
                id="new-student" 
                checked={isNewStudent}
                onCheckedChange={(checked) => setIsNewStudent(checked as boolean)}
              />
              <label
                htmlFor="new-student"
                className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-foreground/80"
              >
                I'm a new student (no previous college credits)
              </label>
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <Button 
              variant="outline" 
              onClick={() => navigate("/")}
              className="border-border text-foreground/80 hover:bg-accent"
            >
              Back
            </Button>
            <Button 
              className="flex-1 bg-red-600 hover:bg-red-700"
              onClick={() => void handleContinue()}
              disabled={saving}
            >
              {saving ? "Saving..." : "Continue"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
