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

export default function BasicProfile() {
  const navigate = useNavigate();
  const [isNewStudent, setIsNewStudent] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [uid, setUid] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const supabase = getSupabaseClient();
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
        navigate("/onboarding/goals");
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

      setMessage("Profile saved.");
      navigate("/onboarding/goals");
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
          <span className="text-2xl text-white">OrbitUMD</span>
        </div>

        <div className="mb-8">
          <p className="text-sm text-neutral-400 text-center mb-2">Step 1 of 4: Basic Info</p>
          <Progress value={25} className="h-2" />
        </div>

        <Card className="p-8 bg-[#252525] border-neutral-800">
          <div className="mb-6">
            <h2 className="text-3xl text-white mb-2">Let's get started</h2>
            <p className="text-neutral-400">Tell us the basics so we can build the right plan for you.</p>
          </div>

          <div className="space-y-6">
            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" className="bg-[#1a1a1a] border-neutral-700" />
              <p className="text-xs text-neutral-500 mt-1">We'll use this to personalize your experience</p>
            </div>

            <div>
              <Label htmlFor="email">UMD Email</Label>
              <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="yourid@umd.edu" className="bg-[#1a1a1a] border-neutral-700" />
              <p className="text-xs text-neutral-500 mt-1">Your official university email address</p>
            </div>

            <div>
              <Label htmlFor="uid">UMD UID</Label>
              <Input id="uid" value={uid} onChange={(event) => setUid(event.target.value)} placeholder="123456789" className="bg-[#1a1a1a] border-neutral-700" />
              <p className="text-xs text-neutral-500 mt-1">Your 9-digit university ID number</p>
            </div>

            {message && (
              <p className="text-sm text-neutral-300">{message}</p>
            )}

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Label htmlFor="degree-type">Degree Type</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-4 h-4 text-neutral-500 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="bg-[#2a2a2a] border-neutral-700">
                      <p>You can change this later in Settings</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select defaultValue="bs">
                <SelectTrigger className="bg-[#1a1a1a] border-neutral-700">
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
                      <Info className="w-4 h-4 text-neutral-500 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="bg-[#2a2a2a] border-neutral-700">
                      <p>This can be edited later</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select defaultValue="cmsc">
                <SelectTrigger className="bg-[#1a1a1a] border-neutral-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cmsc">Computer Science</SelectItem>
                  <SelectItem value="phys">Physics</SelectItem>
                  <SelectItem value="biol">Biological Sciences</SelectItem>
                  <SelectItem value="math">Mathematics</SelectItem>
                  <SelectItem value="eng">Engineering</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Label htmlFor="starting-semester">Starting Semester</Label>
              </div>
              <Select defaultValue="fall2026">
                <SelectTrigger className="bg-[#1a1a1a] border-neutral-700">
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
                <SelectTrigger className="bg-[#1a1a1a] border-neutral-700">
                  <SelectValue placeholder="Select year..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2028">2028</SelectItem>
                  <SelectItem value="2029">2029</SelectItem>
                  <SelectItem value="2030">2030</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2 p-4 bg-[#1a1a1a] rounded-lg border border-neutral-800">
              <Checkbox 
                id="new-student" 
                checked={isNewStudent}
                onCheckedChange={(checked) => setIsNewStudent(checked as boolean)}
              />
              <label
                htmlFor="new-student"
                className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-neutral-300"
              >
                I'm a new student (no previous college credits)
              </label>
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <Button 
              variant="outline" 
              onClick={() => navigate("/")}
              className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
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
