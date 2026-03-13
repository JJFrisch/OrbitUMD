import { useEffect, useMemo, useState } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
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
  reorderUserDegreePrograms,
  removeUserDegreeProgram,
  listProgramCatalogOptions,
  removeLocalCatalogProgramSelection,
  setLocalCatalogExpectedGraduationTerm,
  setLocalCatalogPrimaryProgram,
  type CatalogProgramOption,
  type UserDegreeProgram,
} from "@/lib/repositories/degreeProgramsRepository";
import { listUserPriorCredits } from "@/lib/repositories/priorCreditsRepository";
import { getSupabaseClient } from "@/lib/supabase/client";
import { loadProgramRequirementBundles } from "@/lib/requirements/audit";
import {
  buildProgramTemplateKey,
  saveProgramRequirementTemplate,
} from "@/lib/repositories/programRequirementTemplatesRepository";

interface TermOption {
  id: string;
  label: string;
}

const ADMIN_UNLOCK_PASSWORD = "qim*fu2";

function normalizeProgramName(value: string): string {
  return value
    .toLowerCase()
    .replace(/bachelor of science|bachelor of arts|double degree|second major|b\.\s*s\.?|b\.\s*a\.?|bs|ba/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function summarizePriorCredits(priorCredits: Array<{ sourceType: string; credits: number }>) {
  const apOnly = priorCredits.filter((record) => record.sourceType === "AP");
  return {
    totalCredits: priorCredits.reduce((sum, record) => sum + (Number(record.credits ?? 0) || 0), 0),
    apCredits: apOnly.reduce((sum, record) => sum + (Number(record.credits ?? 0) || 0), 0),
    apRecords: apOnly.length,
  };
}

export default function Settings() {
  const { theme, toggleTheme, setTheme } = useTheme();

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [uid, setUid] = useState("");

  const [userPrograms, setUserPrograms] = useState<UserDegreeProgram[]>([]);
  const [draggingProgramId, setDraggingProgramId] = useState<string | null>(null);
  const [allPrograms, setAllPrograms] = useState<CatalogProgramOption[]>([]);
  const [selectedProgramToAdd, setSelectedProgramToAdd] = useState("");

  const [termOptions, setTermOptions] = useState<TermOption[]>([]);
  const [expectedGraduationTermId, setExpectedGraduationTermId] = useState<string>("none");
  const [priorCreditSummary, setPriorCreditSummary] = useState({ totalCredits: 0, apCredits: 0, apRecords: 0 });

  const [defaultTerm, setDefaultTerm] = useState(() => localStorage.getItem("orbitumd-default-term") ?? "none");
  const [scheduleView, setScheduleView] = useState(() => localStorage.getItem("orbitumd-schedule-view") ?? "weekly");

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminProgramId, setAdminProgramId] = useState("");
  const [adminTemplateJson, setAdminTemplateJson] = useState("[]");
  const [adminTemplateMessage, setAdminTemplateMessage] = useState<string | null>(null);

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

        const [{ data: profileRow, error: profileError }, { data: terms, error: termError }, priorCredits] = await Promise.all([
          supabase
            .from("user_profiles")
            .select("display_name, email, university_uid, preferred_theme, default_term_id, schedule_view, role")
            .eq("id", authUser.id)
            .maybeSingle(),
          supabase
            .from("terms")
            .select("id, year, season")
            .order("year", { ascending: false })
            .limit(80),
          listUserPriorCredits(),
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
        if (profileRow?.preferred_theme === "light" || profileRow?.preferred_theme === "dark") {
          setTheme(profileRow.preferred_theme);
        }
        setDefaultTerm(String(profileRow?.default_term_id ?? localStorage.getItem("orbitumd-default-term") ?? "none"));
        setScheduleView(String(profileRow?.schedule_view ?? localStorage.getItem("orbitumd-schedule-view") ?? "weekly"));
        setIsAdmin(profileRow?.role === "ADMIN");
        setTermOptions((terms ?? []).map((row: any) => ({
          id: row.id,
          label: `${seasonLabel[row.season] ?? row.season} ${row.year}`,
        })));
        setPriorCreditSummary(summarizePriorCredits(priorCredits));
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
  }, [setTheme]);

  useEffect(() => {
    if (adminProgramId) {
      const stillExists = userPrograms.some((program) => program.id === adminProgramId);
      if (stillExists) return;
    }
    setAdminProgramId(userPrograms[0]?.id ?? "");
  }, [adminProgramId, userPrograms]);

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

  const handleDropProgram = async (targetProgramId: string) => {
    if (!draggingProgramId || draggingProgramId === targetProgramId) return;

    const fromIndex = userPrograms.findIndex((program) => program.id === draggingProgramId);
    const toIndex = userPrograms.findIndex((program) => program.id === targetProgramId);
    if (fromIndex < 0 || toIndex < 0) return;

    const reordered = [...userPrograms];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setUserPrograms(reordered);

    try {
      await reorderUserDegreePrograms(reordered.map((program) => program.id));
      setSaveMessage("Program order saved.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Unable to save program order.");
      await refreshAcademicData();
    } finally {
      setDraggingProgramId(null);
    }
  };

  const handleSavePreferences = () => {
    const run = async () => {
      localStorage.setItem("orbitumd-default-term", defaultTerm);
      localStorage.setItem("orbitumd-schedule-view", scheduleView);

      if (!userId) {
        setSaveMessage("Preferences saved on this device.");
        return;
      }

      const supabase = getSupabaseClient();
      const { error } = await supabase.from("user_profiles").upsert(
        {
          id: userId,
          default_term_id: defaultTerm === "none" ? null : defaultTerm,
          schedule_view: scheduleView,
        },
        { onConflict: "id" },
      );

      if (error) throw error;
      setSaveMessage("Preferences saved.");
    };

    void run().catch((error) => {
      setSaveMessage(error instanceof Error ? error.message : "Unable to save preferences.");
    });
  };

  const handleToggleAppearance = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    toggleTheme();

    const run = async () => {
      if (!userId) return;
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("user_profiles").upsert(
        {
          id: userId,
          preferred_theme: nextTheme,
        },
        { onConflict: "id" },
      );
      if (error) throw error;
    };

    void run().catch((error) => {
      setSaveMessage(error instanceof Error ? error.message : "Unable to save appearance preference.");
    });
  };

  const handleUnlockAdmin = async () => {
    if (adminPassword !== ADMIN_UNLOCK_PASSWORD) {
      setAdminTemplateMessage("Admin password is incorrect.");
      return;
    }

    try {
      if (!userId) throw new Error("Please sign in to enable admin mode.");

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("user_profiles")
        .upsert({ id: userId, role: "ADMIN" }, { onConflict: "id" });

      if (error) throw error;

      setIsAdmin(true);
      setAdminPassword("");
      setAdminTemplateMessage("Admin mode enabled.");
    } catch (error) {
      setAdminTemplateMessage(error instanceof Error ? error.message : "Unable to enable admin mode.");
    }
  };

  const handleLoadTemplateDraft = async () => {
    try {
      const selectedProgram = userPrograms.find((program) => program.id === adminProgramId);
      if (!selectedProgram) throw new Error("Select one of your declared programs first.");

      const bundles = await loadProgramRequirementBundles([selectedProgram]);
      const sections = bundles[0]?.sections ?? [];
      setAdminTemplateJson(JSON.stringify(sections, null, 2));
      setAdminTemplateMessage(`Loaded ${sections.length} sections for ${selectedProgram.programName}.`);
    } catch (error) {
      setAdminTemplateMessage(error instanceof Error ? error.message : "Unable to load template draft.");
    }
  };

  const handleSaveOfficialTemplate = async () => {
    try {
      const selectedProgram = userPrograms.find((program) => program.id === adminProgramId);
      if (!selectedProgram) throw new Error("Select one of your declared programs first.");

      const parsed = JSON.parse(adminTemplateJson);
      if (!Array.isArray(parsed)) {
        throw new Error("Template JSON must be an array of requirement sections.");
      }

      const programKey = buildProgramTemplateKey({
        programId: selectedProgram.programId,
        programCode: selectedProgram.programCode,
        programName: selectedProgram.programName,
        degreeType: selectedProgram.degreeType,
      });

      await saveProgramRequirementTemplate(programKey, parsed);
      setAdminTemplateMessage(`Official template saved for ${selectedProgram.programName}.`);
    } catch (error) {
      setAdminTemplateMessage(error instanceof Error ? error.message : "Unable to save official template.");
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-4xl mb-2">Settings</h1>
          <p className="text-muted-foreground">Manage your profile, programs, and planning preferences</p>
        </div>

        {loading && <p className="text-muted-foreground">Loading settings...</p>}
        {!loading && errorMessage && <p className="text-red-400">{errorMessage}</p>}
        {!loading && !errorMessage && (
          <div className="space-y-6">
            {saveMessage && (
              <Card className="p-4 bg-card border-border">
                <p className="text-sm text-foreground/80">{saveMessage}</p>
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
                <Switch id="theme-toggle" checked={theme === "dark"} onCheckedChange={handleToggleAppearance} />
              </div>
            </Card>

            <Card className="p-6 bg-card border-border">
              <div className="flex items-center gap-2 mb-6">
                <User className="w-5 h-5 text-red-400" />
                <h2 className="text-2xl">Profile Information</h2>
              </div>

              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSaveProfile();
                }}
              >
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

                <Button type="submit" className="bg-primary hover:bg-primary/90">
                  Save Profile Changes
                </Button>
              </form>
            </Card>

            <Card className="p-6 bg-card border-border">
              <div className="flex items-center gap-2 mb-6">
                <GraduationCap className="w-5 h-5 text-blue-400" />
                <h2 className="text-2xl">Academic Information</h2>
              </div>

              <div className="mb-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border border-border bg-input-background p-3">
                  <p className="text-xs text-muted-foreground">Prior Credit Total</p>
                  <p className="text-xl text-foreground">{priorCreditSummary.totalCredits}</p>
                </div>
                <div className="rounded-lg border border-border bg-input-background p-3">
                  <p className="text-xs text-muted-foreground">AP Credits</p>
                  <p className="text-xl text-foreground">{priorCreditSummary.apCredits}</p>
                </div>
                <div className="rounded-lg border border-border bg-input-background p-3">
                  <p className="text-xs text-muted-foreground">AP Records</p>
                  <p className="text-xl text-foreground">{priorCreditSummary.apRecords}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block">Declared Programs</Label>
                  <p className="text-xs text-muted-foreground mb-2">Drag and drop to reorder your majors/minors.</p>
                  {userPrograms.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No declared programs yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {userPrograms.map((program) => (
                        <div
                          key={program.id}
                          draggable
                          onDragStart={() => setDraggingProgramId(program.id)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => void handleDropProgram(program.id)}
                          className="flex items-center justify-between rounded-lg border border-border bg-input-background p-3 gap-3 cursor-grab active:cursor-grabbing"
                        >
                          <div>
                            <p className="text-sm text-foreground">{program.programName}</p>
                            <p className="text-xs text-muted-foreground">{program.programCode} {program.degreeType ? `- ${program.degreeType}` : ""}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {program.isPrimary ? (
                              <Badge className="bg-blue-100 text-blue-900 border border-blue-300 dark:bg-blue-600/20 dark:text-blue-300 dark:border-blue-600/30"><Star className="w-3 h-3 mr-1" />Primary</Badge>
                            ) : (
                              <Button variant="outline" size="sm" className="border-border" onClick={() => handleSetPrimaryProgram(program.id)}>
                                Set Primary
                              </Button>
                            )}
                            <Button variant="outline" size="sm" className="border-red-400 text-red-800 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-600/10" onClick={() => handleRemoveProgram(program.id)}>
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

              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSavePreferences();
                }}
              >
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

                <Button type="submit" className="bg-primary hover:bg-primary/90">
                  Save Preferences
                </Button>
              </form>
            </Card>

            <Card className="p-6 bg-card border-border">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-2xl">Admin</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Admins can save official requirement template JSON for majors/minors.
                  </p>
                </div>
                {isAdmin ? (
                  <Badge className="bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-600/20 dark:text-emerald-300 dark:border-emerald-600/30">
                    ADMIN
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-border text-foreground/70">USER</Badge>
                )}
              </div>

              {!isAdmin && (
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleUnlockAdmin();
                  }}
                >
                  <Label htmlFor="admin-password">Admin Password</Label>
                  <div className="flex gap-2">
                    <Input
                      id="admin-password"
                      type="password"
                      value={adminPassword}
                      onChange={(event) => setAdminPassword(event.target.value)}
                      className="bg-input-background border-border"
                      placeholder="Enter admin password"
                    />
                    <Button type="submit" variant="outline" className="border-border">
                      Become Admin
                    </Button>
                  </div>
                </form>
              )}

              {isAdmin && (
                <div className="space-y-4">
                  <div>
                    <Label>Program Template Target</Label>
                    <Select value={adminProgramId} onValueChange={setAdminProgramId}>
                      <SelectTrigger className="bg-input-background border-border mt-2">
                        <SelectValue placeholder="Select one of your declared programs" />
                      </SelectTrigger>
                      <SelectContent>
                        {userPrograms.map((program) => (
                          <SelectItem key={program.id} value={program.id}>
                            {program.programName} ({program.degreeType ?? "program"})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      The selected program's key determines which default template future users will receive.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="border-border" onClick={() => void handleLoadTemplateDraft()} disabled={!adminProgramId}>
                      Load Current Template Draft
                    </Button>
                    <Button className="bg-primary hover:bg-primary/90" onClick={() => void handleSaveOfficialTemplate()} disabled={!adminProgramId}>
                      Save Official Template JSON
                    </Button>
                  </div>

                  <div>
                    <Label htmlFor="admin-template-json">Official Requirement Template JSON</Label>
                    <Textarea
                      id="admin-template-json"
                      value={adminTemplateJson}
                      onChange={(event) => setAdminTemplateJson(event.target.value)}
                      className="mt-2 min-h-[280px] font-mono text-xs"
                    />
                  </div>
                </div>
              )}

              {adminTemplateMessage && <p className="text-sm text-foreground/80 mt-4">{adminTemplateMessage}</p>}
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
