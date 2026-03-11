import { useEffect, useMemo, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { AlertCircle, BookOpenCheck, Info } from "lucide-react";
import { listUserDegreePrograms, type UserDegreeProgram } from "@/lib/repositories/degreeProgramsRepository";
import {
  loadProgramRequirementBundles,
  type ProgramRequirementBundle,
  type RequirementSectionBundle,
} from "@/lib/requirements/audit";

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
            <div key={`${section.id}-logic-${index}`} className="p-3 bg-input-background border border-border rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <Badge variant="outline" className="border-border text-foreground/80">{block.type} Block</Badge>
                <span className="text-xs text-muted-foreground">{block.codes.length} course{block.codes.length === 1 ? "" : "s"}</span>
              </div>
              <p className="text-sm text-foreground/80">
                {block.type === "OR" ? block.codes.join(" or ") : block.codes.join(" and ")}
              </p>
            </div>
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

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        const selected = await listUserDegreePrograms();
        if (!active) return;

        setPrograms(selected);

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
                        Source: {activeBundle.source === "db" ? "Saved Custom Requirements" : "Scraped Catalog Requirements"}
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
