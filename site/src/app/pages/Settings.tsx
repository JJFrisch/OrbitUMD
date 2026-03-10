import { useEffect, useMemo, useState } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { User, Mail, GraduationCap, Settings2, Moon, Sun, Edit, Plus, Trash2, Star } from "lucide-react";
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
import {
  addUserDegreeProgramFromCatalogOption,
  listUserDegreePrograms,
  removeUserDegreeProgram,
  listProgramCatalogOptions,
  removeLocalCatalogProgramSelection,
  setLocalCatalogExpectedGraduationTerm,
  setLocalCatalogPrimaryProgram,
  type CatalogProgramOption,
  type UserDegreeProgram,
} from "@/lib/repositories/degreeProgramsRepository";
import { getSupabaseClient } from "@/lib/supabase/client";

interface TermOption {
  id: string;
  label: string;
}

export default function Settings() {
  const { theme, toggleTheme } = useTheme();

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [uid, setUid] = useState("");

  const [userPrograms, setUserPrograms] = useState<UserDegreeProgram[]>([]);
  const [allPrograms, setAllPrograms] = useState<CatalogProgramOption[]>([]);
  const [selectedProgramToAdd, setSelectedProgramToAdd] = useState("");

  const [termOptions, setTermOptions] = useState<TermOption[]>([]);
  const [expectedGraduationTermId, setExpectedGraduationTermId] = useState<string>("none");

  const [defaultTerm, setDefaultTerm] = useState(() => localStorage.getItem("orbitumd-default-term") ?? "none");
  const [scheduleView, setScheduleView] = useState(() => localStorage.getItem("orbitumd-schedule-view") ?? "weekly");

  const refreshAcademicData = async () => {
    const [declared, available] = await Promise.all([listUserDegreePrograms(), listProgramCatalogOptions()]);
    setUserPrograms(declared);
    setAllPrograms(available);

    const primary = declared.find((program) => program.isPrimary) ?? declared[0] ?? null;
    setExpectedGraduationTermId(primary?.expectedGraduationTermId ?? "none");
  };

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        const supabase = getSupabaseClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;

        const authUser = authData.user;
        if (!authUser) throw new Error("Please sign in to manage settings.");

        const [{ data: profileRow, error: profileError }, { data: terms, error: termError }] = await Promise.all([
          supabase
            .from("user_profiles")
            .select("display_name, email, university_uid")
            .eq("id", authUser.id)
            .maybeSingle(),
          supabase
            .from("terms")
            .select("id, year, season")
            .order("year", { ascending: false })
            .limit(20),
        ]);

        if (profileError) throw profileError;
        if (termError) throw termError;

        await refreshAcademicData();

        const seasonLabel: Record<string, string> = {
          winter: "Winter",
          spring: "Spring",
          summer: "Summer",
          fall: "Fall",
        };

        if (!active) return;

        setUserId(authUser.id);
        setFullName(String(profileRow?.display_name ?? authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? ""));
        setEmail(String(profileRow?.email ?? authUser.email ?? ""));
        setUid(String(profileRow?.university_uid ?? ""));
        setTermOptions((terms ?? []).map((row: any) => ({
          id: row.id,
          label: `${seasonLabel[row.season] ?? row.season} ${row.year}`,
        })));
        setErrorMessage(null);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Unable to load settings.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, []);

  const addablePrograms = useMemo(() => {
    const existingNames = new Set(userPrograms.map((program) => program.programName.toLowerCase()));
    return allPrograms.filter((program) => !existingNames.has(program.name.toLowerCase()));
  }, [allPrograms, userPrograms]);

  const primaryProgram = useMemo(() => userPrograms.find((program) => program.isPrimary) ?? null, [userPrograms]);

  const handleSaveProfile = async () => {
    if (!userId) return;

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("user_profiles").upsert(
        {
          id: userId,
          display_name: fullName.trim() || null,
          email: email.trim() || null,
          university_uid: uid.trim() || null,
        },
        { onConflict: "id" },
      );

      if (error) throw error;
      setSaveMessage("Profile saved.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Unable to save profile.");
    }
  };

  const handleAddProgram = async () => {
    if (!selectedProgramToAdd) return;

    try {
      const option = allPrograms.find((program) => program.key === selectedProgramToAdd);
      if (!option) {
        throw new Error("Selected program option could not be resolved.");
      }

      await addUserDegreeProgramFromCatalogOption(option);
      setSelectedProgramToAdd("");
      await refreshAcademicData();
      setSaveMessage("Program added.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Unable to add program.");
    }
  };

  const handleRemoveProgram = async (userDegreeProgramId: string) => {
    try {
      if (userDegreeProgramId.startsWith("local-link:")) {
        await removeLocalCatalogProgramSelection(userDegreeProgramId);
      } else {
        await removeUserDegreeProgram(userDegreeProgramId);
      }
      await refreshAcademicData();
      setSaveMessage("Program removed.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Unable to remove program.");
    }
  };

  const handleSetPrimaryProgram = async (programLinkId: string) => {
    try {
      if (programLinkId.startsWith("local-link:")) {
        await setLocalCatalogPrimaryProgram(programLinkId);
        await refreshAcademicData();
        setSaveMessage("Primary program updated.");
        return;
      }

      if (!userId) return;

      const supabase = getSupabaseClient();
      const { error: clearError } = await supabase
        .from("user_degree_programs")
        .update({ is_primary: false })
        .eq("user_id", userId);
      if (clearError) throw clearError;

      const { error: setError } = await supabase
        .from("user_degree_programs")
        .update({ is_primary: true })
        .eq("id", programLinkId)
        .eq("user_id", userId);
      if (setError) throw setError;

      await refreshAcademicData();
      setSaveMessage("Primary program updated.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Unable to set primary program.");
    }
  };

  const handleSaveGraduationTerm = async () => {
    if (!primaryProgram) return;

    try {
      if (primaryProgram.id.startsWith("local-link:")) {
        await setLocalCatalogExpectedGraduationTerm(
          primaryProgram.id,
          expectedGraduationTermId === "none" ? null : expectedGraduationTermId,
        );
        await refreshAcademicData();
        setSaveMessage("Expected graduation term saved.");
        return;
      }

      if (!userId) return;

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("user_degree_programs")
        .update({ expected_graduation_term_id: expectedGraduationTermId === "none" ? null : expectedGraduationTermId })
        .eq("id", primaryProgram.id)
        .eq("user_id", userId);

      if (error) throw error;

      await refreshAcademicData();
      setSaveMessage("Expected graduation term saved.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Unable to save graduation term.");
    }
  };

  const handleSavePreferences = () => {
    localStorage.setItem("orbitumd-default-term", defaultTerm);
    localStorage.setItem("orbitumd-schedule-view", scheduleView);
    setSaveMessage("Preferences saved on this device.");
  };

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-4xl mb-2">Settings</h1>
          <p className="text-muted-foreground">Manage your profile, programs, and planning preferences</p>
        </div>

        {loading && <p className="text-neutral-400">Loading settings...</p>}
        {!loading && errorMessage && <p className="text-red-400">{errorMessage}</p>}
        {!loading && !errorMessage && (
          <div className="space-y-6">
            {saveMessage && (
              <Card className="p-4 bg-[#252525] border-neutral-800">
                <p className="text-sm text-neutral-200">{saveMessage}</p>
              </Card>
            )}

            <Card className="p-6 bg-card border-border">
              <div className="flex items-center gap-2 mb-6">
                {theme === "dark" ? <Moon className="w-5 h-5 text-purple-400" /> : <Sun className="w-5 h-5 text-amber-500" />}
                <h2 className="text-2xl">Appearance</h2>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="theme-toggle">Dark Mode</Label>
                  <p className="text-xs text-muted-foreground mt-1">Toggle between light and dark theme.</p>
                </div>
                <Switch id="theme-toggle" checked={theme === "dark"} onCheckedChange={toggleTheme} />
              </div>
            </Card>

            <Card className="p-6 bg-card border-border">
              <div className="flex items-center gap-2 mb-6">
                <User className="w-5 h-5 text-red-400" />
                <h2 className="text-2xl">Profile Information</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Full Name</Label>
                  <Input id="name" value={fullName} onChange={(event) => setFullName(event.target.value)} className="bg-input-background border-border" />
                </div>

                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="bg-input-background border-border" />
                </div>

                <div>
                  <Label htmlFor="uid">UMD UID</Label>
                  <Input id="uid" value={uid} onChange={(event) => setUid(event.target.value)} className="bg-input-background border-border" />
                </div>

                <Button className="bg-primary hover:bg-primary/90" onClick={handleSaveProfile}>
                  Save Profile Changes
                </Button>
              </div>
            </Card>

            <Card className="p-6 bg-card border-border">
              <div className="flex items-center gap-2 mb-6">
                <GraduationCap className="w-5 h-5 text-blue-400" />
                <h2 className="text-2xl">Academic Information</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block">Declared Programs</Label>
                  {userPrograms.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No declared programs yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {userPrograms.map((program) => (
                        <div key={program.id} className="flex items-center justify-between rounded-lg border border-neutral-700 bg-input-background p-3 gap-3">
                          <div>
                            <p className="text-sm text-white">{program.programName}</p>
                            <p className="text-xs text-neutral-400">{program.programCode} {program.degreeType ? `- ${program.degreeType}` : ""}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {program.isPrimary ? (
                              <Badge className="bg-blue-600/20 text-blue-300 border border-blue-600/30"><Star className="w-3 h-3 mr-1" />Primary</Badge>
                            ) : (
                              <Button variant="outline" size="sm" className="border-neutral-700" onClick={() => handleSetPrimaryProgram(program.id)}>
                                Set Primary
                              </Button>
                            )}
                            <Button variant="outline" size="sm" className="border-red-700 text-red-400 hover:bg-red-600/10" onClick={() => handleRemoveProgram(program.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <Label>Add Program</Label>
                  <div className="flex gap-2 mt-2">
                    <Select value={selectedProgramToAdd} onValueChange={setSelectedProgramToAdd}>
                      <SelectTrigger className="bg-input-background border-border flex-1">
                        <SelectValue placeholder="Select a major/minor program" />
                      </SelectTrigger>
                      <SelectContent>
                        {addablePrograms.map((program) => (
                          <SelectItem key={program.key} value={program.key}>{program.name} ({program.type})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" className="border-border" onClick={handleAddProgram} disabled={!selectedProgramToAdd}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add
                    </Button>
                  </div>
                </div>

                <Separator className="bg-border" />

                <div>
                  <Label>Expected Graduation (Primary Program)</Label>
                  <div className="flex gap-2 mt-2">
                    <Select value={expectedGraduationTermId} onValueChange={setExpectedGraduationTermId}>
                      <SelectTrigger className="bg-input-background border-border flex-1">
                        <SelectValue placeholder="Select expected graduation term" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not set</SelectItem>
                        {termOptions.map((term) => (
                          <SelectItem key={term.id} value={term.id}>{term.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" className="border-border" onClick={handleSaveGraduationTerm} disabled={!primaryProgram}>
                      Save
                    </Button>
                  </div>
                  {!primaryProgram && <p className="text-xs text-muted-foreground mt-1">Set a primary program first to save graduation term.</p>}
                </div>

                <Separator className="bg-border" />

                <div>
                  <Label className="mb-2 block">Degree Requirements</Label>
                  <p className="text-xs text-muted-foreground mb-3">
                    Requirement sections are loaded from your saved rule sets or scraped catalog bundles.
                  </p>
                  <Link to="/degree-requirements">
                    <Button variant="outline" size="sm" className="border-border hover:bg-accent">
                      <Edit className="w-4 h-4 mr-2" />
                      Open Degree Requirements
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-card border-border">
              <div className="flex items-center gap-2 mb-6">
                <Settings2 className="w-5 h-5 text-purple-400" />
                <h2 className="text-2xl">Preferences</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <Label>Default Term</Label>
                  <Select value={defaultTerm} onValueChange={setDefaultTerm}>
                    <SelectTrigger className="bg-input-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Auto (current term)</SelectItem>
                      {termOptions.map((term) => (
                        <SelectItem key={term.id} value={term.id}>{term.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">Used by scheduler screens on this device.</p>
                </div>

                <div>
                  <Label>Schedule View Preference</Label>
                  <Select value={scheduleView} onValueChange={setScheduleView}>
                    <SelectTrigger className="bg-input-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly Calendar</SelectItem>
                      <SelectItem value="list">List View</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button className="bg-primary hover:bg-primary/90" onClick={handleSavePreferences}>
                  Save Preferences
                </Button>
              </div>
            </Card>

            <Card className="p-6 bg-card border-border">
              <div className="flex items-center gap-2 mb-6">
                <Mail className="w-5 h-5 text-amber-400" />
                <h2 className="text-2xl">Data Management</h2>
              </div>

              <div className="space-y-3">
                <Link to="/credit-import">
                  <Button variant="outline" className="w-full border-border hover:bg-accent">
                    Open Credit Import
                  </Button>
                </Link>
                <Link to="/schedules">
                  <Button variant="outline" className="w-full border-border hover:bg-accent">
                    Manage Saved Schedules
                  </Button>
                </Link>
                <Button variant="outline" className="w-full border-border hover:bg-accent" onClick={() => window.open("https://app.testudo.umd.edu", "_blank")}>
                  Open Testudo
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
