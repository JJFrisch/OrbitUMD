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
  if (section.requirementType === "choose") {
    return (
      <Badge className="bg-amber-600/20 text-amber-300 border border-amber-600/30">
        Choose {section.chooseCount ?? 1}
      </Badge>
    );
  }

  return <Badge variant="outline" className="border-neutral-700 text-neutral-300">All Required</Badge>;
}

function SectionCard({ section }: { section: RequirementSectionBundle }) {
  return (
    <Card className="bg-[#252525] border-neutral-800 p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-lg text-white">{section.title}</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {section.special && (
            <Badge className="bg-purple-600/20 text-purple-300 border border-purple-600/30">
              Specialization / Option
            </Badge>
          )}
          <RequirementTypeBadge {...{ section }} />
        </div>
      </div>

      {section.optionGroups.length > 0 && (
        <div className="mb-3 space-y-2">
          {section.optionGroups.map((group, index) => (
            <div key={`${section.id}-group-${index}`} className="p-3 bg-[#1a1a1a] border border-neutral-800 rounded-lg">
              <p className="text-xs text-neutral-400 mb-2">Option Group {index + 1}</p>
              <p className="text-sm text-neutral-200">{group.join(" or ")}</p>
            </div>
          ))}
        </div>
      )}

      {section.standaloneCodes.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {section.standaloneCodes.map((code) => (
            <Badge key={`${section.id}-${code}`} variant="outline" className="border-blue-600/30 text-blue-300 bg-blue-600/10">
              {code}
            </Badge>
          ))}
        </div>
      )}

      {section.notes.length > 0 && (
        <div className="p-3 bg-[#1a1a1a] border border-neutral-800 rounded-lg">
          <p className="text-xs text-neutral-400 mb-2">Notes</p>
          <ul className="space-y-1">
            {section.notes.map((note, idx) => (
              <li key={`${section.id}-note-${idx}`} className="text-sm text-neutral-300">
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
          <h1 className="text-4xl text-white mb-2">Degree Requirements</h1>
          <p className="text-neutral-400">
            Requirements are shown per selected major/minor and grouped with explicit notes, options, and course lists.
          </p>
        </div>

        {loading && <p className="text-neutral-400">Loading requirements...</p>}
        {!loading && errorMessage && <p className="text-red-400">{errorMessage}</p>}

        {!loading && !errorMessage && programs.length === 0 && (
          <Card className="bg-[#252525] border-neutral-800 p-6 text-center">
            <AlertCircle className="w-7 h-7 text-amber-400 mx-auto mb-2" />
            <p className="text-white mb-1">No selected major/minor programs found.</p>
            <p className="text-neutral-400">Select programs first to view requirement tabs.</p>
          </Card>
        )}

        {!loading && !errorMessage && programs.length > 0 && (
          <>
            <Card className="bg-[#252525] border-neutral-800 p-3 mb-5">
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
                          ? "bg-red-600/20 border-red-600/40 text-red-300"
                          : "bg-[#1a1a1a] border-neutral-700 text-neutral-300 hover:bg-[#2a2a2a]"
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
                <Card className="bg-[#252525] border-neutral-800 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-2xl text-white">{activeBundle.programName}</h2>
                      <p className="text-sm text-neutral-400 mt-1">
                        Source: {activeBundle.source === "db" ? "Saved Custom Requirements" : "Scraped Catalog Requirements"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-neutral-700 text-neutral-200">
                        {activeBundle.kind.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className="border-neutral-700 text-neutral-200">
                        {activeBundle.sections.length} Sections
                      </Badge>
                    </div>
                  </div>

                  {activeBundle.specializations.length > 0 && (
                    <div className="mt-4 p-3 rounded-lg border border-purple-600/30 bg-purple-600/10">
                      <div className="flex items-center gap-2 mb-2">
                        <BookOpenCheck className="w-4 h-4 text-purple-300" />
                        <p className="text-purple-200 text-sm">Specializations / Tracks</p>
                      </div>
                      <ul className="space-y-1">
                        {activeBundle.specializations.map((line, idx) => (
                          <li key={`${activeBundle.programId}-spec-${idx}`} className="text-sm text-purple-100/90">
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-4 p-3 rounded-lg border border-neutral-700 bg-[#1a1a1a]">
                    <div className="flex items-center gap-2 mb-2">
                      <Info className="w-4 h-4 text-neutral-300" />
                      <p className="text-sm text-neutral-200">How To Read This</p>
                    </div>
                    <p className="text-sm text-neutral-400">
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
