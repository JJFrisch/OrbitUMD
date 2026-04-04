import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  Edit,
  GraduationCap,
  Link2,
  LogIn,
  LogOut,
  Mail,
  Moon,
  Plus,
  Settings2,
  Shield,
  Star,
  Sun,
  Trash2,
  User,
} from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { Link, useLocation, useNavigate } from "react-router";
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
import { listUserRequirementSectionEdits } from "@/lib/repositories/userRequirementSectionEditsRepository";
import { getSupabaseClient } from "@/lib/supabase/client";
import { loadProgramRequirementBundles } from "@/lib/requirements/audit";
import {
  buildProgramTemplateKey,
  saveProgramRequirementTemplate,
} from "@/lib/repositories/programRequirementTemplatesRepository";
import {
  loadNotificationPreferences,
  saveNotificationPreferences,
} from "@/lib/repositories/notificationPreferencesRepository";
import {
  loadSettingsAccountBackup,
  saveSettingsAccountBackup,
} from "@/lib/repositories/settingsAccountRepository";
import { GlobalSearchPanel } from "../components/GlobalSearchPanel";
import { resetAllPageTours } from "../components/PageOnboardingTour";
import "./settings-template.css";

interface TermOption {
  id: string;
  label: string;
  season: string;
  year: number;
}

const ADMIN_UNLOCK_PASSWORD = import.meta.env.VITE_ADMIN_UNLOCK_PASSWORD ?? "";
const GRADUATION_SEASONS = ["spring", "summer", "fall", "winter"] as const;

type SettingsSectionId = "account" | "academic" | "scheduling" | "notifications" | "privacy" | "integrations";
type ToggleSyncState = "idle" | "saving" | "synced" | "error";

const SETTINGS_SECTIONS: Array<{ id: SettingsSectionId; label: string }> = [
  { id: "account", label: "Account" },
  { id: "academic", label: "Academic" },
  { id: "scheduling", label: "Scheduling" },
  { id: "notifications", label: "Notifications" },
  { id: "privacy", label: "Privacy" },
  { id: "integrations", label: "Integrations" },
];

function sectionFromHash(hash: string): SettingsSectionId | null {
  const cleaned = hash.replace(/^#/, "").trim().toLowerCase();
  if (!cleaned) return null;
  return SETTINGS_SECTIONS.some((section) => section.id === cleaned as SettingsSectionId)
    ? (cleaned as SettingsSectionId)
    : null;
}

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

function readBooleanSetting(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export default function Settings() {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme, setTheme } = useTheme();

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

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
  const [expectedGraduationSeason, setExpectedGraduationSeason] = useState<string>("none");
  const [expectedGraduationYear, setExpectedGraduationYear] = useState<string>("none");
  const [priorCreditSummary, setPriorCreditSummary] = useState({ totalCredits: 0, apCredits: 0, apRecords: 0 });

  const [defaultTerm, setDefaultTerm] = useState(() => localStorage.getItem("orbitumd-default-term") ?? "none");
  const [scheduleView, setScheduleView] = useState(() => localStorage.getItem("orbitumd-schedule-view") ?? "weekly");

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminProgramId, setAdminProgramId] = useState("");
  const [adminTemplateJson, setAdminTemplateJson] = useState("[]");
  const [adminTemplateMessage, setAdminTemplateMessage] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(sectionFromHash(location.hash) ?? "account");

  const [notifyRegistrationWindow, setNotifyRegistrationWindow] = useState(true);
  const [notifySeatAvailability, setNotifySeatAvailability] = useState(true);
  const [notifyWaitlistMovement, setNotifyWaitlistMovement] = useState(true);
  const [notifyGraduationGaps, setNotifyGraduationGaps] = useState(true);
  const [notifyDropDeadlines, setNotifyDropDeadlines] = useState(true);
  const [notifyFeatureAnnouncements, setNotifyFeatureAnnouncements] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyPush, setNotifyPush] = useState(false);

  const [shareAnonymousUsage, setShareAnonymousUsage] = useState(true);
  const [storeScheduleHistory, setStoreScheduleHistory] = useState(true);

  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);
  const [outlookConnected, setOutlookConnected] = useState(false);
  const [canvasConnected, setCanvasConnected] = useState(false);
  const [togglePrefsHydrated, setTogglePrefsHydrated] = useState(false);
  const [toggleSyncState, setToggleSyncState] = useState<ToggleSyncState>("idle");
  const [toggleSyncError, setToggleSyncError] = useState<string | null>(null);

  const refreshAcademicData = async (fallbackExpectedGraduationTermId?: string | null) => {
    const [declared, available] = await Promise.all([listUserDegreePrograms(), listProgramCatalogOptions()]);
    setUserPrograms(declared);
    setAllPrograms(available);

    const primary = declared.find((program) => program.isPrimary) ?? declared[0] ?? null;
    setExpectedGraduationTermId(primary?.expectedGraduationTermId ?? fallbackExpectedGraduationTermId ?? "none");
  };

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        const supabase = getSupabaseClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;

        const authUser = authData.user;
        if (!authUser) {
          if (!active) return;
          setIsAuthenticated(false);
          setTogglePrefsHydrated(false);
          setToggleSyncState("idle");
          setToggleSyncError(null);
          setUserId(null);
          setFullName("");
          setEmail("");
          setUid("");
          setUserPrograms([]);
          setAllPrograms([]);
          setTermOptions([]);
          setErrorMessage(null);
          return;
        }
        const metadataBackup = await loadSettingsAccountBackup(authUser);

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

        const notificationPreferences = await loadNotificationPreferences();

        await refreshAcademicData(metadataBackup.expectedGraduationTermId ?? null);

        const seasonLabel: Record<string, string> = {
          winter: "Winter",
          spring: "Spring",
          summer: "Summer",
          fall: "Fall",
        };

        if (!active) return;

        setIsAuthenticated(true);
        setUserId(authUser.id);
        setFullName(String(profileRow?.display_name ?? metadataBackup.fullName ?? authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? ""));
        setEmail(String(profileRow?.email ?? metadataBackup.email ?? authUser.email ?? ""));
        setUid(String(profileRow?.university_uid ?? metadataBackup.uid ?? ""));
        if (profileRow?.preferred_theme === "light" || profileRow?.preferred_theme === "dark") {
          setTheme(profileRow.preferred_theme);
        }
        setDefaultTerm(String(profileRow?.default_term_id ?? metadataBackup.defaultTerm ?? localStorage.getItem("orbitumd-default-term") ?? "none"));
        setScheduleView(String(profileRow?.schedule_view ?? metadataBackup.scheduleView ?? localStorage.getItem("orbitumd-schedule-view") ?? "weekly"));
        setIsAdmin(profileRow?.role === "ADMIN");
        setTermOptions((terms ?? []).map((row: any) => ({
          id: row.id,
          label: `${seasonLabel[row.season] ?? row.season} ${row.year}`,
          season: String(row.season ?? "").toLowerCase(),
          year: Number(row.year),
        })));
        setPriorCreditSummary(summarizePriorCredits(priorCredits));
        setNotifyRegistrationWindow(notificationPreferences.notifyRegistrationWindow);
        setNotifySeatAvailability(notificationPreferences.notifySeatAvailability);
        setNotifyWaitlistMovement(notificationPreferences.notifyWaitlistMovement);
        setNotifyGraduationGaps(notificationPreferences.notifyGraduationGaps);
        setNotifyDropDeadlines(notificationPreferences.notifyDropDeadlines);
        setNotifyFeatureAnnouncements(notificationPreferences.notifyFeatureAnnouncements);
        setNotifyEmail(notificationPreferences.notifyEmail);
        setNotifyPush(notificationPreferences.notifyPush);
        setShareAnonymousUsage(readBooleanSetting(metadataBackup.shareAnonymousUsage, true));
        setStoreScheduleHistory(readBooleanSetting(metadataBackup.storeScheduleHistory, true));
        setGoogleCalendarConnected(readBooleanSetting(metadataBackup.googleCalendarConnected, false));
        setOutlookConnected(readBooleanSetting(metadataBackup.outlookConnected, false));
        setCanvasConnected(readBooleanSetting(metadataBackup.canvasConnected, false));
        setTogglePrefsHydrated(true);
        setToggleSyncState("synced");
        setToggleSyncError(null);
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
    if (!isAuthenticated || !togglePrefsHydrated) return;

    setToggleSyncState("saving");
    setToggleSyncError(null);

    const timeout = window.setTimeout(() => {
      const updatedAt = new Date().toISOString();
      void Promise.all([
        saveNotificationPreferences({
          notifyRegistrationWindow,
          notifySeatAvailability,
          notifyWaitlistMovement,
          notifyGraduationGaps,
          notifyDropDeadlines,
          notifyFeatureAnnouncements,
          notifyEmail,
          notifyPush,
          updatedAt,
        }),
        saveSettingsAccountBackup({
          shareAnonymousUsage,
          storeScheduleHistory,
          googleCalendarConnected,
          outlookConnected,
          canvasConnected,
          updatedAt,
        }),
      ]).then(() => {
        setToggleSyncState("synced");
      }).catch((error) => {
        setToggleSyncState("error");
        setToggleSyncError(error instanceof Error ? error.message : "Unable to sync toggle settings.");
      });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [
    canvasConnected,
    googleCalendarConnected,
    isAuthenticated,
    notifyDropDeadlines,
    notifyEmail,
    notifyFeatureAnnouncements,
    notifyGraduationGaps,
    notifyPush,
    notifyRegistrationWindow,
    notifySeatAvailability,
    notifyWaitlistMovement,
    outlookConnected,
    shareAnonymousUsage,
    storeScheduleHistory,
    togglePrefsHydrated,
  ]);

  useEffect(() => {
    const fromHash = sectionFromHash(location.hash);
    if (fromHash) {
      setActiveSection(fromHash);
    }
  }, [location.hash]);

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

  const graduationYearOptions = useMemo(() => {
    const years = new Set<number>();
    const currentYear = new Date().getFullYear();

    for (const term of termOptions) {
      years.add(term.year);
    }

    for (let offset = 0; offset < 8; offset += 1) {
      years.add(currentYear + offset);
    }

    return Array.from(years).sort((a, b) => a - b);
  }, [termOptions]);

  const selectedGraduationTerm = useMemo(() => {
    if (expectedGraduationSeason === "none" || expectedGraduationYear === "none") {
      return null;
    }

    return termOptions.find((term) => (
      term.season === expectedGraduationSeason
      && String(term.year) === expectedGraduationYear
    )) ?? null;
  }, [expectedGraduationSeason, expectedGraduationYear, termOptions]);

  useEffect(() => {
    if (expectedGraduationTermId === "none") {
      setExpectedGraduationSeason("none");
      setExpectedGraduationYear("none");
      return;
    }

    const selected = termOptions.find((term) => term.id === expectedGraduationTermId);
    if (!selected) {
      return;
    }

    setExpectedGraduationSeason(selected.season);
    setExpectedGraduationYear(String(selected.year));
  }, [expectedGraduationTermId, termOptions]);

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
      await saveSettingsAccountBackup({
        fullName: fullName.trim() || undefined,
        email: email.trim() || undefined,
        uid: uid.trim() || undefined,
      });
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

    const termIdToSave = expectedGraduationSeason === "none" || expectedGraduationYear === "none"
      ? "none"
      : selectedGraduationTerm?.id ?? null;

    if (termIdToSave === null) {
      setSaveMessage("Selected graduation season/year is not available yet. Try another term.");
      return;
    }

    try {
      if (primaryProgram.id.startsWith("local-link:")) {
        await setLocalCatalogExpectedGraduationTerm(
          primaryProgram.id,
          termIdToSave === "none" ? null : termIdToSave,
        );
        await saveSettingsAccountBackup({
          expectedGraduationTermId: termIdToSave === "none" ? null : termIdToSave,
          expectedGraduationSeason: expectedGraduationSeason === "none" ? null : expectedGraduationSeason,
          expectedGraduationYear: expectedGraduationYear === "none" ? null : expectedGraduationYear,
        });
        await refreshAcademicData();
        setSaveMessage("Expected graduation term saved.");
        return;
      }

      if (!userId) return;

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("user_degree_programs")
        .update({ expected_graduation_term_id: termIdToSave === "none" ? null : termIdToSave })
        .eq("id", primaryProgram.id)
        .eq("user_id", userId);

      if (error) throw error;

      await saveSettingsAccountBackup({
        expectedGraduationTermId: termIdToSave === "none" ? null : termIdToSave,
        expectedGraduationSeason: expectedGraduationSeason === "none" ? null : expectedGraduationSeason,
        expectedGraduationYear: expectedGraduationYear === "none" ? null : expectedGraduationYear,
      });

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
      await saveSettingsAccountBackup({
        defaultTerm,
        scheduleView,
      });
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

  const handleReplayPageGuides = () => {
    resetAllPageTours();
    setSaveMessage("Page guides reset. Guides will open again the first time you visit each page.");
  };

  const handleLogout = async () => {
    setSigningOut(true);
    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut({ scope: "local" });
      navigate("/sign-in", { replace: true });
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Unable to sign out.");
    } finally {
      setSigningOut(false);
    }
  };

  const handleLogin = () => {
    navigate("/sign-in?next=/settings");
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

  const handleSetCurrentDegreeToTemplate = async () => {
    try {
      const selectedProgram = userPrograms.find((program) => program.id === adminProgramId);
      if (!selectedProgram) throw new Error("Select one of your declared programs first.");

      const [bundles, sectionEdits] = await Promise.all([
        loadProgramRequirementBundles([selectedProgram]),
        listUserRequirementSectionEdits(),
      ]);

      const baseSections = bundles[0]?.sections ?? [];
      const editedSections = sectionEdits[selectedProgram.programId];
      const sectionsToSave = Array.isArray(editedSections) && editedSections.length > 0
        ? editedSections
        : baseSections;

      if (sectionsToSave.length === 0) {
        throw new Error("Current degree audit has no sections to save as template.");
      }

      // Capture wildcard selections from localStorage if they exist
      let wildcardSelectionsNote = "";
      try {
        const wildcardSelections = localStorage.getItem("orbitumd:audit-wildcard-selections:v1");
        if (wildcardSelections) {
          const parsed = JSON.parse(wildcardSelections);
          // Filter to include only wildcards for this program
          const programWildcards = Object.entries(parsed).filter(([key]) =>
            key.startsWith(`${selectedProgram.programId}:`)
          );
          if (programWildcards.length > 0) {
            wildcardSelectionsNote = `\n\nNote: This template includes ${programWildcards.length} wildcard course selection${programWildcards.length > 1 ? "s" : ""}. These selections are stored separately and will be restored when the template is loaded.`;
          }
        }
      } catch { /* noop */ }

      const programKey = buildProgramTemplateKey({
        programId: selectedProgram.programId,
        programCode: selectedProgram.programCode,
        programName: selectedProgram.programName,
        degreeType: selectedProgram.degreeType,
      });

      await saveProgramRequirementTemplate(programKey, sectionsToSave);
      setAdminTemplateJson(JSON.stringify(sectionsToSave, null, 2));
      setAdminTemplateMessage(`Set current degree to template for ${selectedProgram.programName}.${wildcardSelectionsNote}`);
    } catch (error) {
      setAdminTemplateMessage(error instanceof Error ? error.message : "Unable to set current degree to template.");
    }
  };

  const handleSelectSection = (sectionId: SettingsSectionId) => {
    setActiveSection(sectionId);
    window.history.replaceState(null, "", `#${sectionId}`);
  };

  const connectIntegration = (
    integration: "google" | "outlook" | "canvas",
  ) => {
    if (integration === "google") setGoogleCalendarConnected(true);
    if (integration === "outlook") setOutlookConnected(true);
    if (integration === "canvas") setCanvasConnected(true);
    setSaveMessage("Integration connected.");
  };

  const sectionIcon = (sectionId: SettingsSectionId) => {
    if (sectionId === "account") return <User size={14} />;
    if (sectionId === "academic") return <GraduationCap size={14} />;
    if (sectionId === "scheduling") return <CalendarDays size={14} />;
    if (sectionId === "notifications") return <Bell size={14} />;
    if (sectionId === "privacy") return <Shield size={14} />;
    return <Link2 size={14} />;
  };

  const toggleSyncLabel = useMemo(() => {
    if (!isAuthenticated) return "Sign in to sync toggle settings";
    if (!togglePrefsHydrated) return "Loading toggle settings...";
    if (toggleSyncState === "saving") return "Syncing settings...";
    if (toggleSyncState === "error") return toggleSyncError ?? "Sync failed";
    return "Settings synced";
  }, [isAuthenticated, togglePrefsHydrated, toggleSyncError, toggleSyncState]);

  const toggleSyncTone = useMemo(() => {
    if (!isAuthenticated) return "muted";
    if (toggleSyncState === "saving") return "saving";
    if (toggleSyncState === "error") return "error";
    return "synced";
  }, [isAuthenticated, toggleSyncState]);

  return (
    <div className="ou-settings-page">
      <div className="ou-settings-header">
        <h1 className="ou-settings-page-title">Settings</h1>
        <p className="ou-settings-page-subtitle">Manage your profile, programs, and planning preferences.</p>
      </div>

      {loading && <p className="ou-status-text">Loading settings...</p>}
      {!loading && errorMessage && <p className="ou-status-text ou-status-error">{errorMessage}</p>}

      {!loading && !errorMessage && (
        <div className="ou-settings-shell">
          <aside className="ou-settings-nav">
            <div className="ou-settings-nav-header">Settings</div>
            {SETTINGS_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => handleSelectSection(section.id)}
                className={`ou-settings-nav-item ${activeSection === section.id ? "active" : ""}`}
              >
                <span className="ou-settings-nav-icon">{sectionIcon(section.id)}</span>
                <span>{section.label}</span>
              </button>
            ))}
          </aside>

          <div className="ou-settings-content">
            {saveMessage && (
              <div className="ou-toast-message">{saveMessage}</div>
            )}

            <section className={`ou-settings-section ${activeSection === "account" ? "active" : ""}`}>
              <h2 className="ou-section-title">Account</h2>
              <p className="ou-section-subtitle">Manage your profile, sign-in, and appearance preferences.</p>

              <div className="ou-card" data-tour-target="settings-profile">
                <div className="ou-card-title">Profile</div>
                <form
                  className="ou-card-body"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleSaveProfile();
                  }}
                >
                  <div className="ou-row">
                    <div className="ou-row-label">Full Name</div>
                    <input className="ou-input" value={fullName} onChange={(event) => setFullName(event.target.value)} />
                  </div>
                  <div className="ou-row">
                    <div className="ou-row-label">Email</div>
                    <input className="ou-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                  </div>
                  <div className="ou-row">
                    <div className="ou-row-label">UMD UID</div>
                    <input className="ou-input" value={uid} onChange={(event) => setUid(event.target.value)} />
                  </div>
                  <div className="ou-card-footer">
                    <button type="submit" className="ou-btn ou-btn-primary">Save Profile</button>
                  </div>
                </form>
              </div>

              <div className="ou-card">
                <div className="ou-card-title">
                  <span className="ou-inline-title">Appearance</span>
                  {theme === "dark" ? <Moon size={14} /> : <Sun size={14} />}
                </div>
                <div className="ou-card-body">
                  <div className="ou-row">
                    <div className="ou-row-text">
                      <div className="ou-row-label">Dark Mode</div>
                      <div className="ou-row-desc">Toggle between light and dark theme.</div>
                    </div>
                    <label className="ou-toggle">
                      <input type="checkbox" checked={theme === "dark"} onChange={handleToggleAppearance} />
                      <span className="ou-toggle-track" />
                      <span className="ou-toggle-thumb" />
                    </label>
                  </div>
                </div>
              </div>

              <div className="ou-card">
                <div className="ou-card-title">Session</div>
                <div className="ou-card-body">
                  <div className="ou-row">
                    <div className="ou-row-text">
                      <div className="ou-row-label">Account Sync</div>
                      <div className="ou-row-desc">
                        {isAuthenticated
                          ? "You are logged in. Your preferences can sync with your account."
                          : "Log in to save your work and access it across devices."}
                      </div>
                    </div>
                    {isAuthenticated ? (
                      <button className="ou-btn ou-btn-danger" type="button" onClick={() => void handleLogout()} disabled={signingOut}>
                        <LogOut size={14} /> {signingOut ? "Logging out..." : "Log out"}
                      </button>
                    ) : (
                      <button className="ou-btn ou-btn-outline" type="button" onClick={handleLogin}>
                        <LogIn size={14} /> Log in
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className={`ou-settings-section ${activeSection === "academic" ? "active" : ""}`}>
              <h2 className="ou-section-title">Academic</h2>
              <p className="ou-section-subtitle">Set degree programs, graduation term, and requirements.</p>

              <div className="ou-kpi-grid">
                <div className="ou-kpi-card">
                  <div className="ou-kpi-label">Prior Credit Total</div>
                  <div className="ou-kpi-value">{priorCreditSummary.totalCredits}</div>
                </div>
                <div className="ou-kpi-card">
                  <div className="ou-kpi-label">AP Credits</div>
                  <div className="ou-kpi-value">{priorCreditSummary.apCredits}</div>
                </div>
                <div className="ou-kpi-card">
                  <div className="ou-kpi-label">AP Records</div>
                  <div className="ou-kpi-value">{priorCreditSummary.apRecords}</div>
                </div>
              </div>

              <div className="ou-card" data-tour-target="settings-academic">
                <div className="ou-card-title">Declared Programs</div>
                <div className="ou-card-body">
                  {userPrograms.length === 0 ? (
                    <p className="ou-empty-text">No declared programs yet.</p>
                  ) : (
                    <div className="ou-program-list">
                      {userPrograms.map((program) => (
                        <div
                          key={program.id}
                          draggable
                          onDragStart={() => setDraggingProgramId(program.id)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => void handleDropProgram(program.id)}
                          className="ou-program-row"
                        >
                          <div>
                            <p className="ou-program-name">{program.programName}</p>
                            <p className="ou-program-meta">{program.programCode} {program.degreeType ? `- ${program.degreeType}` : ""}</p>
                          </div>
                          <div className="ou-program-actions">
                            {program.isPrimary ? (
                              <span className="ou-pill"><Star size={12} /> Primary</span>
                            ) : (
                              <button type="button" className="ou-btn ou-btn-outline ou-btn-sm" onClick={() => void handleSetPrimaryProgram(program.id)}>
                                Set Primary
                              </button>
                            )}
                            <button type="button" className="ou-btn ou-btn-danger ou-btn-sm" onClick={() => void handleRemoveProgram(program.id)}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="ou-card">
                <div className="ou-card-title">Add Program</div>
                <div className="ou-card-body">
                  <div className="ou-inline-row">
                    <select className="ou-select" value={selectedProgramToAdd} onChange={(event) => setSelectedProgramToAdd(event.target.value)}>
                      <option value="">Select a major/minor program</option>
                      {addablePrograms.map((program) => (
                        <option key={program.key} value={program.key}>{program.name} ({program.type})</option>
                      ))}
                    </select>
                    <button type="button" className="ou-btn ou-btn-outline" onClick={() => void handleAddProgram()} disabled={!selectedProgramToAdd}>
                      <Plus size={14} /> Add
                    </button>
                  </div>
                </div>
              </div>

              <div className="ou-card" data-tour-target="settings-preferences">
                <div className="ou-card-title">Expected Graduation</div>
                <div className="ou-card-body">
                  <div className="ou-inline-row">
                    <select className="ou-select" value={expectedGraduationSeason} onChange={(event) => setExpectedGraduationSeason(event.target.value)}>
                      <option value="none">Not set</option>
                      {GRADUATION_SEASONS.map((season) => (
                        <option key={season} value={season}>{season.charAt(0).toUpperCase() + season.slice(1)}</option>
                      ))}
                    </select>

                    <select className="ou-select" value={expectedGraduationYear} onChange={(event) => setExpectedGraduationYear(event.target.value)}>
                      <option value="none">Not set</option>
                      {graduationYearOptions.map((year) => (
                        <option key={`grad-year-${year}`} value={String(year)}>{String(year)}</option>
                      ))}
                    </select>

                    <button type="button" className="ou-btn ou-btn-primary" onClick={() => void handleSaveGraduationTerm()} disabled={!primaryProgram}>
                      Save
                    </button>
                  </div>
                  <p className="ou-row-desc">
                    {selectedGraduationTerm
                      ? `Matching term: ${selectedGraduationTerm.label}`
                      : expectedGraduationSeason !== "none" && expectedGraduationYear !== "none"
                        ? "That season/year is not currently available in the term catalog."
                        : "Set a season and year, or leave both as Not set."}
                  </p>
                </div>
              </div>

              <div className="ou-card">
                <div className="ou-card-title">Degree Requirements</div>
                <div className="ou-card-body">
                  <div className="ou-inline-row">
                    <Link className="ou-btn ou-btn-outline" to="/degree-requirements">
                      <Edit size={14} /> Open Degree Requirements
                    </Link>
                  </div>
                </div>
              </div>

              <div className="ou-card">
                <div className="ou-card-title">
                  <span>Admin</span>
                  <span className={`ou-pill ${isAdmin ? "ok" : ""}`}>{isAdmin ? "ADMIN" : "USER"}</span>
                </div>
                <div className="ou-card-body">
                  {!isAdmin && (
                    <form
                      className="ou-inline-row"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handleUnlockAdmin();
                      }}
                    >
                      <input
                        type="password"
                        className="ou-input"
                        value={adminPassword}
                        onChange={(event) => setAdminPassword(event.target.value)}
                        placeholder="Enter admin password"
                      />
                      <button type="submit" className="ou-btn ou-btn-outline">Become Admin</button>
                    </form>
                  )}

                  {isAdmin && (
                    <>
                      <div className="ou-row">
                        <div className="ou-row-label">Program Template Target</div>
                        <select className="ou-select" value={adminProgramId} onChange={(event) => setAdminProgramId(event.target.value)}>
                          <option value="">Select one of your declared programs</option>
                          {userPrograms.map((program) => (
                            <option key={program.id} value={program.id}>{program.programName} ({program.degreeType ?? "program"})</option>
                          ))}
                        </select>
                      </div>

                      <div className="ou-inline-row">
                        <button type="button" className="ou-btn ou-btn-primary" onClick={() => void handleSetCurrentDegreeToTemplate()} disabled={!adminProgramId}>
                          Set Current Degree To Template
                        </button>
                        <button type="button" className="ou-btn ou-btn-outline" onClick={() => void handleLoadTemplateDraft()} disabled={!adminProgramId}>
                          Load Current Template Draft
                        </button>
                        <button type="button" className="ou-btn ou-btn-primary" onClick={() => void handleSaveOfficialTemplate()} disabled={!adminProgramId}>
                          Save Official Template JSON
                        </button>
                      </div>

                      <textarea
                        className="ou-textarea"
                        value={adminTemplateJson}
                        onChange={(event) => setAdminTemplateJson(event.target.value)}
                      />
                    </>
                  )}

                  {adminTemplateMessage && <p className="ou-row-desc">{adminTemplateMessage}</p>}
                </div>
              </div>
            </section>

            <section className={`ou-settings-section ${activeSection === "scheduling" ? "active" : ""}`}>
              <h2 className="ou-section-title">Scheduling</h2>
              <p className="ou-section-subtitle">Set default planner behavior and schedule views.</p>

              <div className="ou-card">
                <div className="ou-card-title">Preferences</div>
                <form
                  className="ou-card-body"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleSavePreferences();
                  }}
                >
                  <div className="ou-row">
                    <div className="ou-row-text">
                      <div className="ou-row-label">Default Term</div>
                      <div className="ou-row-desc">Used by scheduler screens on this device.</div>
                    </div>
                    <select className="ou-select" value={defaultTerm} onChange={(event) => setDefaultTerm(event.target.value)}>
                      <option value="none">Auto (current term)</option>
                      {termOptions.map((term) => (
                        <option key={term.id} value={term.id}>{term.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="ou-row">
                    <div className="ou-row-label">Schedule View Preference</div>
                    <select className="ou-select" value={scheduleView} onChange={(event) => setScheduleView(event.target.value)}>
                      <option value="weekly">Weekly Calendar</option>
                      <option value="list">List View</option>
                    </select>
                  </div>

                  <div className="ou-card-footer">
                    <button type="submit" className="ou-btn ou-btn-primary">Save Preferences</button>
                  </div>
                </form>
              </div>

              <div className="ou-card">
                <div className="ou-card-title">Data Management</div>
                <div className="ou-card-body">
                  <div className="ou-btn-grid">
                    <Link className="ou-btn ou-btn-outline" to="/credit-import">Open Credit Import</Link>
                    <Link className="ou-btn ou-btn-outline" to="/schedules">Manage Saved Schedules</Link>
                    <button className="ou-btn ou-btn-outline" type="button" onClick={() => window.open("https://app.testudo.umd.edu", "_blank")}>Open Testudo</button>
                  </div>
                </div>
              </div>

              <div className="ou-card">
                <div className="ou-card-title">Onboarding Guides</div>
                <div className="ou-card-body">
                  <button className="ou-btn ou-btn-outline" type="button" onClick={handleReplayPageGuides}>Replay Page Guides</button>
                </div>
              </div>
            </section>

            <section className={`ou-settings-section ${activeSection === "notifications" ? "active" : ""}`}>
              <h2 className="ou-section-title">Notifications</h2>
              <p className="ou-section-subtitle">Choose what OrbitUMD notifies you about and how.</p>
              <div className={`ou-sync-indicator ${toggleSyncTone}`}>
                <span className="ou-sync-dot" aria-hidden="true" />
                {toggleSyncLabel}
              </div>

              <div className="ou-card">
                <div className="ou-card-title">Registration Alerts</div>
                <div className="ou-card-body">
                  <div className="ou-row"><div className="ou-row-label">Registration window opening</div><label className="ou-toggle"><input type="checkbox" checked={notifyRegistrationWindow} onChange={(event) => setNotifyRegistrationWindow(event.target.checked)} /><span className="ou-toggle-track" /><span className="ou-toggle-thumb" /></label></div>
                  <div className="ou-row"><div className="ou-row-label">Seat availability</div><label className="ou-toggle"><input type="checkbox" checked={notifySeatAvailability} onChange={(event) => setNotifySeatAvailability(event.target.checked)} /><span className="ou-toggle-track" /><span className="ou-toggle-thumb" /></label></div>
                  <div className="ou-row"><div className="ou-row-label">Waitlist movement</div><label className="ou-toggle"><input type="checkbox" checked={notifyWaitlistMovement} onChange={(event) => setNotifyWaitlistMovement(event.target.checked)} /><span className="ou-toggle-track" /><span className="ou-toggle-thumb" /></label></div>
                </div>
              </div>

              <div className="ou-card">
                <div className="ou-card-title">Academic Reminders</div>
                <div className="ou-card-body">
                  <div className="ou-row"><div className="ou-row-label">Graduation requirement gaps</div><label className="ou-toggle"><input type="checkbox" checked={notifyGraduationGaps} onChange={(event) => setNotifyGraduationGaps(event.target.checked)} /><span className="ou-toggle-track" /><span className="ou-toggle-thumb" /></label></div>
                  <div className="ou-row"><div className="ou-row-label">Drop deadline warnings</div><label className="ou-toggle"><input type="checkbox" checked={notifyDropDeadlines} onChange={(event) => setNotifyDropDeadlines(event.target.checked)} /><span className="ou-toggle-track" /><span className="ou-toggle-thumb" /></label></div>
                  <div className="ou-row"><div className="ou-row-label">Feature announcements</div><label className="ou-toggle"><input type="checkbox" checked={notifyFeatureAnnouncements} onChange={(event) => setNotifyFeatureAnnouncements(event.target.checked)} /><span className="ou-toggle-track" /><span className="ou-toggle-thumb" /></label></div>
                </div>
              </div>

              <div className="ou-card">
                <div className="ou-card-title">Delivery Method</div>
                <div className="ou-card-body">
                  <div className="ou-row"><div className="ou-row-label">Email notifications</div><label className="ou-toggle"><input type="checkbox" checked={notifyEmail} onChange={(event) => setNotifyEmail(event.target.checked)} /><span className="ou-toggle-track" /><span className="ou-toggle-thumb" /></label></div>
                  <div className="ou-row"><div className="ou-row-label">Push notifications</div><label className="ou-toggle"><input type="checkbox" checked={notifyPush} onChange={(event) => setNotifyPush(event.target.checked)} /><span className="ou-toggle-track" /><span className="ou-toggle-thumb" /></label></div>
                </div>
              </div>
            </section>

            <section className={`ou-settings-section ${activeSection === "privacy" ? "active" : ""}`}>
              <h2 className="ou-section-title">Privacy</h2>
              <p className="ou-section-subtitle">Control how your account data is stored and used in OrbitUMD.</p>
              <div className={`ou-sync-indicator ${toggleSyncTone}`}>
                <span className="ou-sync-dot" aria-hidden="true" />
                {toggleSyncLabel}
              </div>

              <div className="ou-card">
                <div className="ou-card-title">Data & Storage</div>
                <div className="ou-card-body">
                  <div className="ou-row"><div className="ou-row-label">Share anonymous usage data</div><label className="ou-toggle"><input type="checkbox" checked={shareAnonymousUsage} onChange={(event) => setShareAnonymousUsage(event.target.checked)} /><span className="ou-toggle-track" /><span className="ou-toggle-thumb" /></label></div>
                  <div className="ou-row"><div className="ou-row-label">Store schedule history</div><label className="ou-toggle"><input type="checkbox" checked={storeScheduleHistory} onChange={(event) => setStoreScheduleHistory(event.target.checked)} /><span className="ou-toggle-track" /><span className="ou-toggle-thumb" /></label></div>
                </div>
              </div>

              <div className="ou-danger-card">
                <div className="ou-danger-title">Danger Zone</div>
                <p className="ou-danger-desc">Deleting your account is permanent and removes plans, schedules, and saved data.</p>
                <button type="button" className="ou-btn ou-btn-danger" onClick={handleLogin}>Manage Account Authentication</button>
              </div>
            </section>

            <section className={`ou-settings-section ${activeSection === "integrations" ? "active" : ""}`}>
              <h2 className="ou-section-title">Integrations</h2>
              <p className="ou-section-subtitle">Connect OrbitUMD to your scheduling and school tools.</p>
              <div className={`ou-sync-indicator ${toggleSyncTone}`}>
                <span className="ou-sync-dot" aria-hidden="true" />
                {toggleSyncLabel}
              </div>

              <div className="ou-card">
                <div className="ou-card-title">Connected Apps</div>
                <div className="ou-card-body">
                  <div className="ou-app-row">
                    <div>
                      <p className="ou-app-title">Google Calendar</p>
                      <p className="ou-row-desc">Sync schedules directly to Google Calendar.</p>
                    </div>
                    <button type="button" className={`ou-btn ${googleCalendarConnected ? "ou-btn-success" : "ou-btn-outline"}`} onClick={() => connectIntegration("google")}>
                      {googleCalendarConnected ? "Connected" : "Connect"}
                    </button>
                  </div>

                  <div className="ou-app-row">
                    <div>
                      <p className="ou-app-title">Outlook / Office 365</p>
                      <p className="ou-row-desc">Export your schedule to Outlook calendars.</p>
                    </div>
                    <button type="button" className={`ou-btn ${outlookConnected ? "ou-btn-success" : "ou-btn-outline"}`} onClick={() => connectIntegration("outlook")}>
                      {outlookConnected ? "Connected" : "Connect"}
                    </button>
                  </div>

                  <div className="ou-app-row">
                    <div>
                      <p className="ou-app-title">Testudo (UMD)</p>
                      <p className="ou-row-desc">Import transcript and prior credits from Testudo exports.</p>
                    </div>
                    <button type="button" className="ou-btn ou-btn-success" onClick={() => window.open("https://app.testudo.umd.edu", "_blank")}>Connected</button>
                  </div>

                  <div className="ou-app-row">
                    <div>
                      <p className="ou-app-title">Canvas LMS</p>
                      <p className="ou-row-desc">Link assignment due dates to your planning workflow.</p>
                    </div>
                    <button type="button" className={`ou-btn ${canvasConnected ? "ou-btn-success" : "ou-btn-outline"}`} onClick={() => connectIntegration("canvas")}>
                      {canvasConnected ? "Connected" : "Connect"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="ou-card">
                <div className="ou-card-title">Quick Tools</div>
                <div className="ou-card-body">
                  <GlobalSearchPanel />
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
