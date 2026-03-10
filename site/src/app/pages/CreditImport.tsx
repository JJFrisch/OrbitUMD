import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Plus, X, Orbit, CheckCircle2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { AP_CREDIT_CATALOG, getApAward } from "@/lib/data/apCreditCatalog";
import { replacePriorCreditsBySource, type SavePriorCreditInput } from "@/lib/repositories/priorCreditsRepository";

interface ApSelection {
  examId: string;
  score: string;
}

function buildApRows(selection: ApSelection): SavePriorCreditInput[] {
  const score = Number(selection.score);
  if (!selection.examId || !Number.isFinite(score)) return [];

  const exam = AP_CREDIT_CATALOG.find((item) => item.id === selection.examId);
  const award = getApAward(selection.examId, score);
  if (!exam || !award) return [];

  const rows: SavePriorCreditInput[] = [];
  const note = `AP ${exam.label} (Score ${score})`;

  if (award.courseCodes.length === 0 || award.ambiguousCourseChoice) {
    rows.push({
      sourceType: "AP",
      originalName: note,
      credits: award.credits,
      genEdCodes: award.genEdCodes,
      termAwarded: "Prior to UMD",
    });
    return rows;
  }

  award.courseCodes.forEach((courseCode, idx) => {
    rows.push({
      sourceType: "AP",
      originalName: note,
      umdCourseCode: courseCode,
      credits: idx === 0 ? award.credits : 0,
      genEdCodes: idx === 0 ? award.genEdCodes : [],
      termAwarded: "Prior to UMD",
    });
  });

  return rows;
}

export default function CreditImport() {
  const navigate = useNavigate();
  const [apSelections, setApSelections] = useState<ApSelection[]>([{ examId: "", score: "" }]);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => {
    let totalCredits = 0;
    let totalCourses = 0;
    let totalGenEds = 0;

    for (const selection of apSelections) {
      const score = Number(selection.score);
      if (!selection.examId || !Number.isFinite(score)) continue;
      const award = getApAward(selection.examId, score);
      if (!award) continue;
      totalCredits += award.credits;
      totalCourses += award.courseCodes.length;
      totalGenEds += award.genEdCodes.length;
    }

    return { totalCredits, totalCourses, totalGenEds };
  }, [apSelections]);

  const addCredit = () => {
    setApSelections((prev) => [...prev, { examId: "", score: "" }]);
  };

  const removeCredit = (index: number) => {
    setApSelections((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const rows = apSelections.flatMap(buildApRows);
      await replacePriorCreditsBySource("AP", rows);
      setSaveMessage(`Saved ${rows.length} AP credit record(s).`);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Unable to save AP credits.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen p-8 flex items-center justify-center">
      <div className="w-full max-w-4xl">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <Orbit className="w-8 h-8 text-red-500" />
          <span className="text-2xl text-white">OrbitUMD</span>
        </div>

        <Card className="p-8 bg-[#252525] border-neutral-800">
          <div className="mb-6">
            <h2 className="text-3xl text-white mb-2">Let's start with what you've already earned</h2>
            <p className="text-neutral-400">
              Add your AP exams and scores to automatically receive mapped UMD courses, Gen Ed tags, and elective credits.
            </p>
          </div>

          {saveMessage && (
            <div className="mb-4 rounded-lg border border-neutral-700 bg-[#1a1a1a] px-4 py-3 text-sm text-neutral-200">
              {saveMessage}
            </div>
          )}

          <div className="space-y-6">
            {apSelections.map((credit, index) => {
              const exam = AP_CREDIT_CATALOG.find((item) => item.id === credit.examId);
              const scoreNumber = Number(credit.score);
              const award = Number.isFinite(scoreNumber) ? getApAward(credit.examId, scoreNumber) : null;

              return (
              <div key={index} className="p-4 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-white">AP Credit {index + 1}</h3>
                  {apSelections.length > 1 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeCredit(index)}
                      className="hover:bg-red-600/20 hover:text-red-400"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>AP Exam</Label>
                    <Select value={credit.examId} onValueChange={(value) => {
                      const next = [...apSelections];
                      next[index] = { ...next[index], examId: value };
                      setApSelections(next);
                    }}>
                      <SelectTrigger className="bg-[#252525] border-neutral-700">
                        <SelectValue placeholder="Select an AP exam" />
                      </SelectTrigger>
                      <SelectContent>
                        {AP_CREDIT_CATALOG.map((item) => (
                          <SelectItem key={item.id} value={item.id}>{item.label}{item.apNumber ? ` (${item.apNumber})` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Score</Label>
                    <Select value={credit.score} onValueChange={(value) => {
                      const next = [...apSelections];
                      next[index] = { ...next[index], score: value };
                      setApSelections(next);
                    }}>
                      <SelectTrigger className="bg-[#252525] border-neutral-700">
                        <SelectValue placeholder="Select score" />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map((score) => (
                          <SelectItem key={score} value={String(score)}>{score}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="md:col-span-2 rounded-lg border border-neutral-700 bg-[#252525] p-3">
                    <div className="flex items-center gap-2 mb-2 text-sm text-neutral-300">
                      <CheckCircle2 className="h-4 w-4 text-green-400" />
                      Award Preview
                    </div>
                    {!credit.examId || !credit.score ? (
                      <p className="text-sm text-neutral-400">Choose an exam and score to preview awarded credits.</p>
                    ) : !award ? (
                      <p className="text-sm text-amber-300">No published credit award for this score.</p>
                    ) : (
                      <div className="text-sm text-neutral-200 space-y-1">
                        <p><span className="text-neutral-400">UMD Equivalency:</span> {award.equivalency}</p>
                        <p><span className="text-neutral-400">Credits:</span> {award.credits}</p>
                        <p><span className="text-neutral-400">Course Credit:</span> {award.courseCodes.length > 0 ? award.courseCodes.join(", ") : "No direct course equivalent"}</p>
                        <p><span className="text-neutral-400">Gen Ed Tags:</span> {award.genEdCodes.length > 0 ? award.genEdCodes.join(", ") : "None"}</p>
                      </div>
                    )}
                  </div>

                  {exam && (
                    <div className="md:col-span-2 text-xs text-neutral-500">
                      Source: UMD AP Gen Ed chart (2023-2025 exams)
                    </div>
                  )}
                </div>
              </div>
            );
            })}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border border-neutral-800 bg-[#1a1a1a] p-3">
                <p className="text-xs text-neutral-400">Total AP Credits</p>
                <p className="text-xl text-white">{totals.totalCredits}</p>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-[#1a1a1a] p-3">
                <p className="text-xs text-neutral-400">Mapped Courses</p>
                <p className="text-xl text-white">{totals.totalCourses}</p>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-[#1a1a1a] p-3">
                <p className="text-xs text-neutral-400">Gen Ed Tags Applied</p>
                <p className="text-xl text-white">{totals.totalGenEds}</p>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={addCredit}
              className="w-full border-neutral-700 text-neutral-300 hover:bg-neutral-800"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Another AP Exam
            </Button>

            <Button
              onClick={() => void handleSave()}
              className="w-full bg-green-700 hover:bg-green-600"
              disabled={saving}
            >
              {saving ? "Saving AP Credits..." : "Save AP Credits"}
            </Button>

            <div className="mt-2 p-4 bg-blue-600/10 border border-blue-600/30 rounded-lg">
              <p className="text-sm text-blue-400">
                Saved AP credits are applied to Gen Eds, degree audit requirements, and total/elective credit calculations.
              </p>
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <Button
              variant="outline"
              onClick={() => navigate("/onboarding/goals")}
              className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
            >
              Back
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700"
              onClick={() => navigate("/gen-eds")}
            >
              Next: Gen Eds
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
