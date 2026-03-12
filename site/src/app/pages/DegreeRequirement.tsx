import { useEffect, useMemo, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { AlertCircle, BookOpenCheck, Info } from "lucide-react";
import { listUserDegreePrograms, type UserDegreeProgram } from "@/lib/repositories/degreeProgramsRepository";
import {
  loadProgramRequirementBundles,
  type ProgramRequirementBundle,
  type RequirementSectionBundle,
} from "@/lib/requirements/audit";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  buildProgramTemplateKey,
  saveProgramRequirementTemplatePayload,
} from "@/lib/repositories/programRequirementTemplatesRepository";

function RequirementTypeBadge({ section }: { section: RequirementSectionBundle }) {
  const optionUniverse = section.courseCodes.length;
  if (section.requirementType === "choose") {
    return (
      <Badge className="bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-600/20 dark:text-amber-300 dark:border-amber-600/30">
        Choose {section.chooseCount ?? 1} of {optionUniverse || section.chooseCount || 1}
      </Badge>
    );
  }

  return <Badge variant="outline" className="border-border text-foreground/80">All Required ({optionUniverse})</Badge>;
}

function SectionCard({ section }: { section: RequirementSectionBundle }) {
  const renderBlock = (block: any, depth: number = 0) => (
    <div
      key={`${section.id}-${depth}-${block.type}-${(block.codes ?? []).join("|")}`}
      className={`p-3 border rounded-lg ${
        block.type === "OR"
          ? "border-amber-300 bg-amber-100 dark:border-amber-600/40 dark:bg-amber-600/10"
          : "border-sky-300 bg-sky-100 dark:border-sky-600/40 dark:bg-sky-600/10"
      }`}
      style={{ marginLeft: `${depth * 12}px` }}
    >
      <div className="flex items-center justify-between mb-1">
        <Badge variant="outline" className="border-border text-foreground/80">{block.type === "OR" ? "OR" : "All Required"}</Badge>
        {block.title && <span className="text-xs text-foreground/80">{block.title}</span>}
        <span className="text-xs text-muted-foreground">{(block.codes ?? []).length} course{(block.codes ?? []).length === 1 ? "" : "s"}</span>
      </div>
      {(block.codes ?? []).length > 0 && (
        <p className="text-sm text-foreground/80">
          {block.type === "OR" ? block.codes.join(" or ") : block.codes.join(", ")}
        </p>
      )}
      {Array.isArray(block.children) && block.children.length > 0 && (
        <div className="mt-2 space-y-2">
          {block.children.map((child: any, idx: number) => (
            <div key={`${section.id}-${depth}-child-${idx}`}>{renderBlock(child, depth + 1)}</div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Card className="bg-card border-border p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-lg text-foreground">{section.title}</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {section.special && (
            <Badge className="bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-600/20 dark:text-purple-300 dark:border-purple-600/30">
              Specialization / Option
            </Badge>
          )}
          <RequirementTypeBadge {...{ section }} />
        </div>
      </div>

      {section.optionGroups.length > 0 && (
        <div className="mb-3 space-y-2">
          {section.optionGroups.map((group, index) => (
            <div key={`${section.id}-group-${index}`} className="p-3 bg-input-background border border-border rounded-lg">
              <p className="text-xs text-muted-foreground mb-2">Option Group {index + 1}</p>
              <p className="text-sm text-foreground/80">{group.join(" or ")}</p>
            </div>
          ))}
        </div>
      )}

      {section.logicBlocks.length > 0 && (
        <div className="mb-3 space-y-2">
          <p className="text-xs text-muted-foreground">Requirement Logic</p>
          {section.logicBlocks.map((block, index) => (
            <div key={`${section.id}-logic-${index}`}>{renderBlock(block, 0)}</div>
          ))}
        </div>
      )}

      {section.standaloneCodes.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {section.standaloneCodes.map((code) => (
            <Badge key={`${section.id}-${code}`} variant="outline" className="border-blue-300 text-blue-900 bg-blue-100 dark:border-blue-600/30 dark:text-blue-300 dark:bg-blue-600/10">
              {code}
            </Badge>
          ))}
        </div>
      )}

      {section.notes.length > 0 && (
        <div className="p-3 bg-input-background border border-border rounded-lg">
          <p className="text-xs text-muted-foreground mb-2">Notes</p>
          <ul className="space-y-1">
            {section.notes.map((note, idx) => (
              <li key={`${section.id}-note-${idx}`} className="text-sm text-foreground/80">
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export default function DegreeRequirementsPage() {
  const [programs, setPrograms] = useState<UserDegreeProgram[]>([]);
  const [bundles, setBundles] = useState<ProgramRequirementBundle[]>([]);
  const [activeProgramId, setActiveProgramId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [newSpecialization, setNewSpecialization] = useState("");
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftRequirementType, setDraftRequirementType] = useState<"all" | "choose">("all");
  const [draftChooseCount, setDraftChooseCount] = useState("1");
  const [draftCourseCodes, setDraftCourseCodes] = useState("");
  const [draftWildcardToken, setDraftWildcardToken] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftSpecial, setDraftSpecial] = useState(false);
  const [draftSpecializationId, setDraftSpecializationId] = useState("none");

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        const selected = await listUserDegreePrograms();
        if (!active) return;

        setPrograms(selected);

        const supabase = getSupabaseClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;

        const authUser = authData.user;
        if (authUser) {
          const { data: profileRow, error: profileError } = await supabase
            .from("user_profiles")
            .select("role")
            .eq("id", authUser.id)
            .maybeSingle();
          if (profileError) throw profileError;
          if (!active) return;
          setIsAdmin(profileRow?.role === "ADMIN");
        }

        const loadedBundles = await loadProgramRequirementBundles(selected);
        if (!active) return;

        setBundles(loadedBundles);
        setActiveProgramId((current) => current || loadedBundles[0]?.programId || "");
        setErrorMessage(null);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Unable to load degree requirements.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, []);

  const activeBundle = useMemo(
    () => bundles.find((bundle) => bundle.programId === activeProgramId) ?? null,
    [activeProgramId, bundles]
  );

  const resetSectionDraft = () => {
    setEditingSectionId(null);
    setDraftTitle("");
    setDraftRequirementType("all");
    setDraftChooseCount("1");
    setDraftCourseCodes("");
    setDraftWildcardToken("");
    setDraftNotes("");
    setDraftSpecial(false);
    setDraftSpecializationId("none");
  };

  const toUniqueCodes = (raw: string): string[] => {
    const values = raw
      .split(/[\n,]/g)
      .map((entry) => entry.trim().toUpperCase())
      .filter((entry) => entry.length > 0);
    return Array.from(new Set(values));
  };

  const toNotes = (raw: string): string[] => {
    return raw
      .split(/\n/g)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  };

  const handleAddWildcardToDraft = () => {
    const token = draftWildcardToken.trim().toUpperCase();
    if (!token) return;
    if (!/^[A-Z]{4}(?:\/[A-Z]{4})*(?:XXX|[1-8]XX)$/.test(token)) {
      setAdminMessage("Wildcard must look like BSCI3XX, BSCI4XX, or CMSC/MATHXXX.");
      return;
    }

    setDraftCourseCodes((prev) => {
      const current = prev.trim();
      return current.length > 0 ? `${current}, ${token}` : token;
    });
    setDraftWildcardToken("");
  };

  const handleAdminClearAll = () => {
    if (!isAdmin || !activeBundle) return;

    setBundles((prev) => prev.map((bundle) =>
      bundle.programId === activeBundle.programId
        ? { ...bundle, sections: [] }
        : bundle,
    ));
    resetSectionDraft();
    setAdminMessage(`Cleared all sections for ${activeBundle.programName}. Save to template to publish this change.`);
  };

  const handleAdminAddSpecialization = () => {
    if (!isAdmin || !activeBundle) return;

    const value = newSpecialization.trim();
    if (!value) return;

    const exists = activeBundle.specializations.some((entry) => entry.toLowerCase() === value.toLowerCase());
    if (exists) {
      setAdminMessage("Specialization already exists.");
      return;
    }

    setBundles((prev) => prev.map((bundle) =>
      bundle.programId === activeBundle.programId
        ? { ...bundle, specializations: [...bundle.specializations, value] }
        : bundle,
    ));
    setNewSpecialization("");
    setAdminMessage(`Added specialization \"${value}\".`);
  };

  const handleAdminRemoveSpecialization = (name: string) => {
    if (!isAdmin || !activeBundle) return;

    const nameLower = name.toLowerCase();
    setBundles((prev) => prev.map((bundle) => {
      if (bundle.programId !== activeBundle.programId) return bundle;

      const remainingSpecializations = bundle.specializations.filter((entry) => entry.toLowerCase() !== nameLower);
      const updatedSections = bundle.sections.map((section) => {
        if (!section.specializationId) return section;
        if (section.specializationId.toLowerCase() !== nameLower) return section;
        return { ...section, specializationId: undefined };
      });

      return {
        ...bundle,
        specializations: remainingSpecializations,
        sections: updatedSections,
      };
    }));

    if (draftSpecializationId.toLowerCase() === nameLower) {
      setDraftSpecializationId("none");
    }

    setAdminMessage(`Removed specialization \"${name}\". Linked sections were unassigned.`);
  };

  const handleAdminEditSection = (section: RequirementSectionBundle) => {
    setEditingSectionId(section.id);
    setDraftTitle(section.title);
    setDraftRequirementType(section.requirementType);
    setDraftChooseCount(String(section.chooseCount ?? 1));
    setDraftCourseCodes(section.courseCodes.join(", "));
    setDraftNotes(section.notes.join("\n"));
    setDraftSpecial(section.special);
    setDraftSpecializationId(section.specializationId ?? "none");
    setAdminMessage(`Editing section \"${section.title}\".`);
  };

  const handleAdminDeleteSection = (sectionId: string) => {
    if (!isAdmin || !activeBundle) return;

    setBundles((prev) => prev.map((bundle) =>
      bundle.programId === activeBundle.programId
        ? { ...bundle, sections: bundle.sections.filter((section) => section.id !== sectionId) }
        : bundle,
    ));

    if (editingSectionId === sectionId) {
      resetSectionDraft();
    }
    setAdminMessage("Section deleted.");
  };

  const handleAdminSaveSection = () => {
    if (!isAdmin || !activeBundle) return;

    const title = draftTitle.trim();
    if (!title) {
      setAdminMessage("Section title is required.");
      return;
    }

    const courseCodes = toUniqueCodes(draftCourseCodes);
    const notes = toNotes(draftNotes);
    const chooseCount = draftRequirementType === "choose"
      ? Math.max(1, Number.parseInt(draftChooseCount, 10) || 1)
      : undefined;

    const optionGroups = courseCodes.map((code) => [code]);
    const logicBlocks = courseCodes.map((code) => ({ type: "AND" as const, codes: [code] }));

    const nextSection: RequirementSectionBundle = {
      id: editingSectionId ?? `admin-${crypto.randomUUID()}`,
      title,
      requirementType: draftRequirementType,
      chooseCount,
      notes,
      special: draftSpecial,
      courseCodes,
      optionGroups,
      standaloneCodes: courseCodes,
      logicBlocks,
      specializationId: draftSpecializationId === "none" ? undefined : draftSpecializationId,
    };

    setBundles((prev) => prev.map((bundle) => {
      if (bundle.programId !== activeBundle.programId) return bundle;

      if (editingSectionId) {
        return {
          ...bundle,
          sections: bundle.sections.map((section) => section.id === editingSectionId ? nextSection : section),
        };
      }

      return {
        ...bundle,
        sections: [...bundle.sections, nextSection],
      };
    }));

    setAdminMessage(editingSectionId ? "Section updated." : "Section created.");
    resetSectionDraft();
  };

  const handleAdminSaveTemplate = async () => {
    if (!isAdmin || !activeBundle) return;

    const selectedProgram = programs.find((program) => program.programId === activeBundle.programId);
    if (!selectedProgram) {
      setAdminMessage("Could not resolve selected program metadata for template save.");
      return;
    }

    setAdminBusy(true);
    setAdminMessage(null);
    try {
      const programKey = buildProgramTemplateKey({
        programId: selectedProgram.programId,
        programCode: selectedProgram.programCode,
        programName: selectedProgram.programName,
        degreeType: selectedProgram.degreeType,
      });

      await saveProgramRequirementTemplatePayload(programKey, {
        sections: activeBundle.sections,
        specializations: activeBundle.specializations,
      });

      setBundles((prev) => prev.map((bundle) =>
        bundle.programId === activeBundle.programId
          ? { ...bundle, source: "official" }
          : bundle,
      ));
      setAdminMessage(`Saved ${activeBundle.sections.length} sections as the official template for ${selectedProgram.programName}.`);
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "Unable to save official template.");
    } finally {
      setAdminBusy(false);
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-4xl text-foreground mb-2">Degree Requirements</h1>
          <p className="text-muted-foreground">
            Requirements are shown per selected major/minor and grouped with explicit notes, options, and course lists.
          </p>
        </div>

        {loading && <p className="text-muted-foreground">Loading requirements...</p>}
        {!loading && errorMessage && <p className="text-red-400">{errorMessage}</p>}

        {!loading && !errorMessage && programs.length === 0 && (
          <Card className="bg-card border-border p-6 text-center">
            <AlertCircle className="w-7 h-7 text-amber-400 mx-auto mb-2" />
            <p className="text-foreground mb-1">No selected major/minor programs found.</p>
            <p className="text-muted-foreground">Select programs first to view requirement tabs.</p>
          </Card>
        )}

        {!loading && !errorMessage && programs.length > 0 && (
          <>
            <Card className="bg-card border-border p-3 mb-5">
              <div className="flex flex-wrap gap-2">
                {bundles.map((bundle) => {
                  const active = bundle.programId === activeProgramId;
                  return (
                    <button
                      key={bundle.programId}
                      type="button"
                      onClick={() => setActiveProgramId(bundle.programId)}
                      className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                        active
                          ? "bg-red-100 border-red-300 text-red-900 dark:bg-red-600/20 dark:border-red-600/40 dark:text-red-300"
                          : "bg-input-background border-border text-foreground/80 hover:bg-popover"
                      }`}
                    >
                      {bundle.programName}
                    </button>
                  );
                })}
              </div>
            </Card>

            {activeBundle && (
              <div className="space-y-5">
                <Card className="bg-card border-border p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-2xl text-foreground">{activeBundle.programName}</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        Source: {activeBundle.source === "official"
                          ? "Official Admin Template"
                          : activeBundle.source === "db"
                            ? "Saved Custom Requirements"
                            : "Scraped Catalog Requirements"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-border text-foreground/80">
                        {activeBundle.kind.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className="border-border text-foreground/80">
                        {activeBundle.sections.length} Sections
                      </Badge>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="mt-4 rounded-lg border border-border bg-input-background p-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <p className="text-sm text-foreground">Admin Template Controls</p>
                          <p className="text-xs text-muted-foreground">Manage specializations, create/edit sections, then save as the official default template.</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="border-red-400 text-red-800 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-600/10"
                            onClick={handleAdminClearAll}
                            disabled={adminBusy}
                          >
                            Clear All Sections
                          </Button>
                          <Button
                            type="button"
                            className="bg-primary hover:bg-primary/90"
                            onClick={() => void handleAdminSaveTemplate()}
                            disabled={adminBusy}
                          >
                            Save To Template
                          </Button>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="rounded-lg border border-border p-3">
                          <Label className="text-sm">Specializations</Label>
                          <div className="flex gap-2 mt-2">
                            <Input
                              value={newSpecialization}
                              onChange={(event) => setNewSpecialization(event.target.value)}
                              placeholder="e.g. Data Science Track"
                            />
                            <Button type="button" variant="outline" onClick={handleAdminAddSpecialization}>Add</Button>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {activeBundle.specializations.map((name) => (
                              <button
                                key={name}
                                type="button"
                                className="px-2 py-1 rounded-md border border-border text-xs hover:bg-accent"
                                onClick={() => handleAdminRemoveSpecialization(name)}
                                title="Remove specialization"
                              >
                                {name} x
                              </button>
                            ))}
                            {activeBundle.specializations.length === 0 && (
                              <p className="text-xs text-muted-foreground">No specializations yet.</p>
                            )}
                          </div>
                        </div>

                        <div className="rounded-lg border border-border p-3">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-sm">Section Editor</Label>
                            {editingSectionId && (
                              <Button type="button" variant="outline" size="sm" onClick={resetSectionDraft}>Cancel Edit</Button>
                            )}
                          </div>

                          <div className="mt-2 space-y-2">
                            <Input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Section title" />
                            <div className="grid grid-cols-2 gap-2">
                              <Select value={draftRequirementType} onValueChange={(value) => setDraftRequirementType(value as "all" | "choose")}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Requirement type" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All Required</SelectItem>
                                  <SelectItem value="choose">Choose N</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                value={draftChooseCount}
                                onChange={(event) => setDraftChooseCount(event.target.value)}
                                placeholder="Choose count"
                                disabled={draftRequirementType !== "choose"}
                              />
                            </div>

                            <Select value={draftSpecializationId} onValueChange={setDraftSpecializationId}>
                              <SelectTrigger>
                                <SelectValue placeholder="Specialization" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No specialization</SelectItem>
                                {activeBundle.specializations.map((name) => (
                                  <SelectItem key={name} value={name}>{name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            <label className="flex items-center gap-2 text-xs text-foreground/80">
                              <input
                                type="checkbox"
                                checked={draftSpecial}
                                onChange={(event) => setDraftSpecial(event.target.checked)}
                              />
                              Mark as specialization/option section
                            </label>

                            <Textarea
                              value={draftCourseCodes}
                              onChange={(event) => setDraftCourseCodes(event.target.value)}
                              placeholder="Course codes (comma or newline separated)"
                              className="min-h-[90px]"
                            />
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                              <Input
                                value={draftWildcardToken}
                                onChange={(event) => setDraftWildcardToken(event.target.value)}
                                placeholder="Add wildcard token (e.g. BSCI3XX, CMSC/MATHXXX)"
                              />
                              <Button type="button" variant="outline" onClick={handleAddWildcardToDraft}>
                                Insert Wildcard
                              </Button>
                            </div>
                            <Textarea
                              value={draftNotes}
                              onChange={(event) => setDraftNotes(event.target.value)}
                              placeholder="Notes (one per line)"
                              className="min-h-[90px]"
                            />

                            <Button type="button" className="w-full" onClick={handleAdminSaveSection}>
                              {editingSectionId ? "Update Section" : "Create Section"}
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-lg border border-border p-3">
                        <p className="text-sm text-foreground">Current Sections</p>
                        <div className="mt-2 space-y-2">
                          {activeBundle.sections.map((section) => (
                            <div key={section.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
                              <div>
                                <p className="text-sm text-foreground">{section.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {section.specializationId ? `Specialization: ${section.specializationId}` : "General"} | {section.courseCodes.length} courses
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={() => handleAdminEditSection(section)}>
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="border-red-400 text-red-800 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-600/10"
                                  onClick={() => handleAdminDeleteSection(section.id)}
                                >
                                  Delete
                                </Button>
                              </div>
                            </div>
                          ))}
                          {activeBundle.sections.length === 0 && (
                            <p className="text-xs text-muted-foreground">No sections yet.</p>
                          )}
                        </div>
                      </div>

                      {adminMessage && <p className="text-xs text-foreground/80 mt-3">{adminMessage}</p>}
                    </div>
                  )}

                  {activeBundle.specializations.length > 0 && (
                    <div className="mt-4 p-3 rounded-lg border border-purple-300 bg-purple-100 dark:border-purple-600/30 dark:bg-purple-600/10">
                      <div className="flex items-center gap-2 mb-2">
                        <BookOpenCheck className="w-4 h-4 text-purple-900 dark:text-purple-300" />
                        <p className="text-purple-900 text-sm dark:text-purple-200">Specializations / Tracks</p>
                      </div>
                      <ul className="space-y-1">
                        {activeBundle.specializations.map((line, idx) => (
                          <li key={`${activeBundle.programId}-spec-${idx}`} className="text-sm text-purple-900/90 dark:text-purple-100/90">
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-4 p-3 rounded-lg border border-border bg-input-background">
                    <div className="flex items-center gap-2 mb-2">
                      <Info className="w-4 h-4 text-foreground/80" />
                      <p className="text-sm text-foreground/80">How To Read This</p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Sections marked "Choose" indicate options/specializations where you only need a subset. Notes preserve catalog wording for constraints and exceptions.
                    </p>
                  </div>
                </Card>

                {activeBundle.sections.map((section) => (
                  <SectionCard key={section.id} section={section} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
