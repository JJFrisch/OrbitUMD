import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card } from "../../components/ui/card";
import TranscriptUploadPanel from "../../components/TranscriptUploadPanel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { FileUp, Info, Orbit, PencilLine } from "lucide-react";
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
  removeLocalCatalogProgramSelection,
  removeUserDegreeProgram,
  setLocalCatalogExpectedGraduationTerm,
  type CatalogProgramOption,
} from "@/lib/repositories/degreeProgramsRepository";
import { replacePriorCreditsByImportOrigin } from "@/lib/repositories/priorCreditsRepository";
import { buildTranscriptPriorCreditImport } from "@/lib/transcripts/transcriptCreditImport";
import type { TranscriptParseResult } from "@/lib/transcripts/unofficialTranscriptParser";

async function loadAllUmdMajors(): Promise<CatalogProgramOption[]> {
  const byName = new Map<string, CatalogProgramOption>();

  try {
    const response = await fetch("https://api.umd.io/v1/majors/list");
    if (response.ok) {
      const payload = (await response.json()) as Array<{ major?: string }>;
      for (const row of payload) {
        const name = String(row.major ?? "").trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (!byName.has(key)) {
          byName.set(key, {
            key: `api:${name}`,
            name,
            type: "major",
            programCode: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            source: "api",
          });
        }
      }
    }
  } catch {
    // Fallback path below
  }

  if (byName.size === 0) {
    const options = await listProgramCatalogOptions();
    for (const option of options) {
      if (option.type !== "major") continue;
      const key = option.name.toLowerCase();
      if (!byName.has(key)) {
        byName.set(key, option);
      }
    }
  }

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export default function BasicProfile() {
  const navigate = useNavigate();
  const [isNewStudent, setIsNewStudent] = useState(false);
  const [entryMethod, setEntryMethod] = useState<"transcript" | "manual">("transcript");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [uid, setUid] = useState("");
  const [degreeType, setDegreeType] = useState("bs");
  const [startingSemester, setStartingSemester] = useState("fall2026");
  const [graduationYear, setGraduationYear] = useState("");
  const [majorOptions, setMajorOptions] = useState<CatalogProgramOption[]>([]);
  const [selectedMajorKey, setSelectedMajorKey] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hasImportedTranscript, setHasImportedTranscript] = useState(false);
  const [transcriptProgramKeys, setTranscriptProgramKeys] = useState<string[]>([]);

  const transcriptContinueReminder = [
    "Go to testudo.umd.edu and open your unofficial transcript in Testudo.",
    "Use your browser's Print action and save the transcript as a PDF.",
    "Upload that PDF here and OrbitUMD will prefill the profile fields it can detect.",
    "You can always fill out this information manually in the Fill out the form tab or skip and upload the information whenever best works for you.",
  ].join("\n\n");

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) return error.message;
    if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
      return String((error as { message: string }).message);
    }
    return fallback;
  };

  const normalizeProgramName = (value: string) => value
    .toLowerCase()
    .replace(/bachelor of science|bachelor of arts|double degree|second major|b\.\s*s\.?|b\.\s*a\.?|bs|ba/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const resolveMajorKey = (rawMajor: string | null | undefined) => {
    const normalizedMajor = normalizeProgramName(String(rawMajor ?? ""));
    if (!normalizedMajor) return "";
    const exact = majorOptions.find((option) => normalizeProgramName(option.name) === normalizedMajor);
    if (exact) return exact.key;
    const partial = majorOptions.find((option) => {
      const optionName = normalizeProgramName(option.name);
      return optionName.includes(normalizedMajor) || normalizedMajor.includes(optionName);
    });
    return partial?.key ?? "";
  };

  const resolveTranscriptProgramKeys = (result: TranscriptParseResult): string[] => {
    const candidates = [result.fields.major, ...result.fields.doubleDegrees]
      .map((value) => String(value ?? "").trim())
      .filter((value) => value.length > 0);

    const keys: string[] = [];
    for (const candidate of candidates) {
      const key = resolveMajorKey(candidate);
      if (key && !keys.includes(key)) {
        keys.push(key);
      }
    }

    return keys;
  };

  const parseSeasonYearTerm = (value: string | null | undefined): { season: string; year: number } | null => {
    const match = String(value ?? "").toLowerCase().match(/^(fall|spring|summer|winter)(20\d{2})$/);
    if (!match) return null;
    return { season: match[1], year: Number(match[2]) };
  };

  const findTermIdBySeasonYear = async (season: string, year: number): Promise<string | null> => {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("terms")
      .select("id")
      .eq("season", season)
      .eq("year", year)
      .limit(1)
      .maybeSingle();

    if (error) {
      return null;
    }

    return String(data?.id ?? "") || null;
  };

  const syncTranscriptPrograms = async (programKeys: string[]) => {
    const selectedOptions = programKeys
      .map((key) => majorOptions.find((option) => option.key === key))
      .filter((option): option is CatalogProgramOption => Boolean(option));
    if (selectedOptions.length === 0) return;

    const existing = await listUserDegreePrograms();
    for (const program of existing) {
      if (program.id.startsWith("local-link:")) {
        await removeLocalCatalogProgramSelection(program.id);
      } else {
        await removeUserDegreeProgram(program.id);
      }
    }

    for (const option of selectedOptions) {
      await addUserDegreeProgramFromCatalogOption(option);
    }
  };

  const applyTranscriptResult = async (result: TranscriptParseResult) => {
    const { fields } = result;
    if (fields.fullName) setName(fields.fullName);
    if (fields.email) setEmail(fields.email);
    if (fields.universityUid) setUid(fields.universityUid);
    if (fields.degree) {
      const normalizedDegree = fields.degree.toLowerCase();
      if (normalizedDegree.includes("double")) setDegreeType("double");
      else if (normalizedDegree.includes("second")) setDegreeType("second");
      else if (normalizedDegree.includes("arts") || normalizedDegree === "ba" || normalizedDegree === "b.a.") setDegreeType("ba");
      else setDegreeType("bs");
    }
    if (fields.graduationYear) {
      setGraduationYear(fields.graduationYear);
    }
    if (fields.admitTerm) {
      const termMatch = fields.admitTerm.match(/(fall|spring|summer|winter)\s+(20\d{2})/i);
      if (termMatch) {
        setStartingSemester(`${termMatch[1].toLowerCase()}${termMatch[2]}`);
      }
    }

    const matchedProgramKeys = resolveTranscriptProgramKeys(result);
    setTranscriptProgramKeys(matchedProgramKeys);
    if (matchedProgramKeys[0]) {
      setSelectedMajorKey(matchedProgramKeys[0]);
    }

    const transcriptImport = await buildTranscriptPriorCreditImport(result);
    await replacePriorCreditsByImportOrigin("testudo_transcript", transcriptImport.records);
    setHasImportedTranscript(true);

    setMessage(matchedProgramKeys[0]
      ? `Transcript imported ${transcriptImport.summary.importedRecords} prior credit records and autofilled your profile. Review everything below before continuing.`
      : `Transcript imported ${transcriptImport.summary.importedRecords} prior credit records. Review the extracted fields below and choose your major if we could not match it.`);
  };

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const supabase = getSupabaseClient();
        const [options, existingPrograms] = await Promise.all([
          loadAllUmdMajors(),
          listUserDegreePrograms(),
        ]);

        const majors = options;
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

  const startingSemesterOptions = [
    "fall2024",
    "spring2025",
    "fall2025",
    "spring2026",
    "fall2026",
    "spring2027",
    "fall2027",
    "spring2028",
    "fall2028",
    "spring2029",
    "fall2029",
    "spring2030",
    "fall2030",
    "spring2031",
    "fall2031",
  ];

  const graduationYearOptions = [
    "2026",
    "2027",
    "2028",
    "2029",
    "2030",
    "2031",
    "2032",
    "2033",
    "2034",
    "2035",
    "2036",
  ];

  const handleContinue = async () => {
    if (entryMethod === "transcript" && !hasImportedTranscript) {
      window.alert(transcriptContinueReminder);
    }

    setSaving(true);
    setMessage(null);
    const destinationAfterSave = hasImportedTranscript
      ? "/onboarding/goals"
      : entryMethod === "manual"
        ? "/credit-import?onboarding=1"
        : "/onboarding/goals";

    try {
      const supabase = getSupabaseClient();
      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData.user;

      if (!authUser) {
        localStorage.setItem("orbitumd-onboarding-name", name.trim());
        localStorage.setItem("orbitumd-onboarding-email", email.trim());
        localStorage.setItem("orbitumd-onboarding-uid", uid.trim());
        localStorage.setItem("orbitumd-onboarding-starting-semester", startingSemester);
        if (selectedMajorKey) {
          localStorage.setItem("orbitumd-onboarding-major-key", selectedMajorKey);
        }
        navigate(destinationAfterSave);
        return;
      }

      const profileDisplayName = name.trim() || authUser.user_metadata?.full_name || authUser.user_metadata?.name || "Student";
      const profileEmail = authUser.email ?? null;
      const profileUid = uid.trim() || null;

      const primaryUpsert = await supabase.from("user_profiles").upsert(
        {
          id: authUser.id,
          display_name: profileDisplayName,
          email: profileEmail,
          university_uid: profileUid,
        },
        { onConflict: "id" },
      );

      if (primaryUpsert.error) {
        // Fall back to a minimal profile write so onboarding can continue.
        const fallbackUpsert = await supabase.from("user_profiles").upsert(
          {
            id: authUser.id,
            display_name: profileDisplayName,
          },
          { onConflict: "id" },
        );

        if (fallbackUpsert.error) {
          throw fallbackUpsert.error;
        }
      }

      try {
        if (hasImportedTranscript && transcriptProgramKeys.length > 0) {
          await syncTranscriptPrograms(transcriptProgramKeys);
        } else if (selectedMajorKey) {
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
      } catch {
        // Do not block onboarding completion if degree program selection fails.
      }

      try {
        const declaredPrograms = await listUserDegreePrograms();
        const primaryProgram = declaredPrograms.find((program) => program.isPrimary) ?? declaredPrograms[0] ?? null;
        if (primaryProgram) {
          const expectedGradTermId = graduationYear
            ? await findTermIdBySeasonYear("spring", Number(graduationYear))
            : null;

          const startTerm = parseSeasonYearTerm(startingSemester);
          const startedTermId = startTerm
            ? await findTermIdBySeasonYear(startTerm.season, startTerm.year)
            : null;

          if (primaryProgram.id.startsWith("local-link:")) {
            await setLocalCatalogExpectedGraduationTerm(primaryProgram.id, expectedGradTermId);
          } else {
            const { error: programUpdateError } = await supabase
              .from("user_degree_programs")
              .update({
                expected_graduation_term_id: expectedGradTermId,
                started_term_id: startedTermId,
              })
              .eq("id", primaryProgram.id)
              .eq("user_id", authUser.id);

            if (programUpdateError) {
              throw programUpdateError;
            }
          }
        }
      } catch {
        // Do not block onboarding completion if term metadata persistence fails.
      }

      setMessage("Profile saved.");
      navigate(destinationAfterSave);
    } catch (error) {
      setMessage(getErrorMessage(error, "Unable to save profile."));
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

        <Card className="p-8 bg-card border-border">
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-3xl text-foreground mb-2">Let's get started</h2>
              <p className="text-muted-foreground">Tell us the basics so we can build the right plan for you.</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => navigate("/onboarding/goals")}
            >
              Skip
            </Button>
          </div>

          <div className="space-y-6">
            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setEntryMethod("transcript")}
                className={`rounded-xl border p-4 text-left transition-colors ${entryMethod === "transcript" ? "border-red-500 bg-red-500/5" : "border-border bg-input-background hover:bg-accent"}`}
              >
                <div className="flex items-center gap-2 text-foreground">
                  <FileUp className="h-4 w-4 text-red-500" />
                  Upload unofficial transcript
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Pull your Testudo PDF and let OrbitUMD prefill your profile.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setEntryMethod("manual")}
                className={`rounded-xl border p-4 text-left transition-colors ${entryMethod === "manual" ? "border-red-500 bg-red-500/5" : "border-border bg-input-background hover:bg-accent"}`}
              >
                <div className="flex items-center gap-2 text-foreground">
                  <PencilLine className="h-4 w-4 text-red-500" />
                  Fill out the form
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Enter your details manually if you do not have your transcript PDF ready.
                </p>
              </button>
            </div>

            {entryMethod === "transcript" && (
              <TranscriptUploadPanel
                instructions={[
                  "Go to testudo.umd.edu and open your unofficial transcript in Testudo.",
                  "Use your browser's Print action and save the transcript as a PDF.",
                  "Upload that PDF here and OrbitUMD will prefill the profile fields it can detect.",
                ]}
                onParsed={applyTranscriptResult}
              />
            )}

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
              <Select value={degreeType} onValueChange={setDegreeType}>
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
              <Select value={startingSemester} onValueChange={setStartingSemester}>
                <SelectTrigger className="bg-input-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {startingSemesterOptions.map((termKey) => {
                    const parsed = parseSeasonYearTerm(termKey);
                    const label = parsed
                      ? `${parsed.season.charAt(0).toUpperCase()}${parsed.season.slice(1)} ${parsed.year}`
                      : termKey;
                    return <SelectItem key={termKey} value={termKey}>{label}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="graduation-year">Expected Graduation Year (Optional)</Label>
              <Select value={graduationYear} onValueChange={setGraduationYear}>
                <SelectTrigger className="bg-input-background border-border">
                  <SelectValue placeholder="Select year..." />
                </SelectTrigger>
                <SelectContent>
                  {graduationYearOptions.map((yearOption) => (
                    <SelectItem key={yearOption} value={yearOption}>{yearOption}</SelectItem>
                  ))}
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
