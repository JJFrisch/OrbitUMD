import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Plus, X, Orbit, CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { AP_CREDIT_CATALOG, getApAward } from "@/lib/data/apCreditCatalog";
import {
  deletePriorCredit,
  insertPriorCredits,
  listUserPriorCredits,
  replacePriorCreditsBySource,
  updatePriorCredit,
  type SavePriorCreditInput,
} from "@/lib/repositories/priorCreditsRepository";
import type { UserPriorCreditRecord } from "@/lib/types/requirements";

interface ApSelection {
  examId: string;
  score: string;
}

interface ManualCreditForm {
  sourceType: "IB" | "transfer";
  originalName: string;
  umdCourseCode: string;
  credits: string;
  genEdCodes: string;
  termAwarded: string;
}

interface EditApState {
  id: string;
  originalName: string;
  umdCourseCode: string;
  credits: string;
  genEdCodes: string;
  termAwarded: string;
}

interface EditManualState {
  id: string;
  sourceType: "IB" | "transfer";
  originalName: string;
  umdCourseCode: string;
  credits: string;
  genEdCodes: string;
  termAwarded: string;
}

function parseGenEdCodes(raw: string): string[] {
  return raw.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
}

function formatLastSavedLabel(value: string | null): string {
  if (!value) return "Not saved yet";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "Saved";
  return `Last saved ${dt.toLocaleString()}`;
}

function buildApRows(selection: ApSelection): SavePriorCreditInput[] {
  const score = Number(selection.score);
  if (!selection.examId || !Number.isFinite(score)) return [];

  const exam = AP_CREDIT_CATALOG.find((item) => item.id === selection.examId);
  const award = getApAward(selection.examId, score);
  if (!exam || !award) return [];

  const note = `AP ${exam.label} (Score ${score})`;
  if (award.courseCodes.length === 0 || award.ambiguousCourseChoice) {
    return [{
      sourceType: "AP",
      originalName: note,
      credits: award.credits,
      genEdCodes: award.genEdCodes,
      termAwarded: "Prior to UMD",
    }];
  }

  return award.courseCodes.map((courseCode, idx) => ({
    sourceType: "AP",
    originalName: note,
    umdCourseCode: courseCode,
    credits: idx === 0 ? award.credits : 0,
    genEdCodes: idx === 0 ? award.genEdCodes : [],
    termAwarded: "Prior to UMD",
  }));
}

export default function CreditImport() {
  const navigate = useNavigate();
  const [activeSource, setActiveSource] = useState<"AP" | "IB" | "transfer">("AP");
  const [apSelections, setApSelections] = useState<ApSelection[]>([{ examId: "", score: "" }]);
  const [savedPriorCredits, setSavedPriorCredits] = useState<UserPriorCreditRecord[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [editingAp, setEditingAp] = useState<EditApState | null>(null);
  const [editingManual, setEditingManual] = useState<EditManualState | null>(null);
  const [manualSearchQuery, setManualSearchQuery] = useState("");
  const [manualCreditForm, setManualCreditForm] = useState<ManualCreditForm>({
    sourceType: "IB",
    originalName: "",
    umdCourseCode: "",
    credits: "",
    genEdCodes: "",
    termAwarded: "Prior to UMD",
  });

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const records = await listUserPriorCredits();
        if (mounted) setSavedPriorCredits(records);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to load saved prior credits.");
      } finally {
        if (mounted) setLoadingSaved(false);
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, []);

  const apSavedRecords = useMemo(
    () => savedPriorCredits.filter((record) => record.sourceType === "AP"),
    [savedPriorCredits],
  );

  const manualSavedRecords = useMemo(
    () => savedPriorCredits.filter((record) => record.sourceType === activeSource),
    [activeSource, savedPriorCredits],
  );

  const filteredManualSavedRecords = useMemo(() => {
    const query = manualSearchQuery.trim().toLowerCase();
    if (!query) return manualSavedRecords;
    return manualSavedRecords.filter((record) => {
      const haystack = [
        record.originalName,
        record.umdCourseCode ?? "",
        record.genEdCodes.join(" "),
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [manualSavedRecords, manualSearchQuery]);

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

  const handleSaveAp = async () => {
    setSaving(true);
    try {
      const rows = apSelections.flatMap(buildApRows);
      await replacePriorCreditsBySource("AP", rows);
      const refreshed = await listUserPriorCredits();
      setSavedPriorCredits(refreshed);
      setLastSavedAt(new Date().toISOString());
      toast.success(`Saved ${rows.length} AP credit record(s).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save AP credits.");
    } finally {
      setSaving(false);
    }
  };

  const handleManualImport = async () => {
    const credits = Number(manualCreditForm.credits);
    if (!manualCreditForm.originalName.trim() || !Number.isFinite(credits) || credits <= 0) {
      toast.error("Enter a credit title and a positive credit value.");
      return;
    }

    const payload: SavePriorCreditInput = {
      sourceType: manualCreditForm.sourceType,
      originalName: manualCreditForm.originalName.trim(),
      umdCourseCode: manualCreditForm.umdCourseCode.trim() || undefined,
      credits,
      genEdCodes: parseGenEdCodes(manualCreditForm.genEdCodes),
      termAwarded: manualCreditForm.termAwarded.trim() || "Prior to UMD",
    };

    setSaving(true);
    try {
      const inserted = await insertPriorCredits([payload]);
      setSavedPriorCredits((prev) => [...inserted, ...prev]);
      setLastSavedAt(new Date().toISOString());
      toast.success(`${manualCreditForm.sourceType} credit imported.`);
      setManualCreditForm((prev) => ({ ...prev, originalName: "", umdCourseCode: "", credits: "", genEdCodes: "" }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to import prior credit.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateApRecord = async () => {
    if (!editingAp) return;
    const credits = Number(editingAp.credits);
    if (!editingAp.originalName.trim() || !Number.isFinite(credits) || credits < 0) {
      toast.error("Provide a valid AP title and credits.");
      return;
    }

    const previous = savedPriorCredits;
    const optimistic: UserPriorCreditRecord = {
      id: editingAp.id,
      userId: savedPriorCredits.find((record) => record.id === editingAp.id)?.userId ?? "",
      sourceType: "AP",
      originalName: editingAp.originalName.trim(),
      umdCourseCode: editingAp.umdCourseCode.trim() || undefined,
      credits,
      genEdCodes: parseGenEdCodes(editingAp.genEdCodes),
      termAwarded: editingAp.termAwarded.trim() || undefined,
      createdAt: savedPriorCredits.find((record) => record.id === editingAp.id)?.createdAt ?? new Date().toISOString(),
    };

    setSavedPriorCredits((prev) => prev.map((record) => (record.id === optimistic.id ? optimistic : record)));
    try {
      const updated = await updatePriorCredit(editingAp.id, {
        originalName: optimistic.originalName,
        umdCourseCode: optimistic.umdCourseCode,
        credits: optimistic.credits,
        genEdCodes: optimistic.genEdCodes,
        termAwarded: optimistic.termAwarded,
      });
      setSavedPriorCredits((prev) => prev.map((record) => (record.id === updated.id ? updated : record)));
      setEditingAp(null);
      setLastSavedAt(new Date().toISOString());
      toast.success("AP record updated.");
    } catch (error) {
      setSavedPriorCredits(previous);
      toast.error(error instanceof Error ? error.message : "Unable to update AP record.");
    }
  };

  const handleDeleteApRecord = async (recordId: string) => {
    const previous = savedPriorCredits;
    setSavedPriorCredits((prev) => prev.filter((record) => record.id !== recordId));
    try {
      await deletePriorCredit(recordId);
      setLastSavedAt(new Date().toISOString());
      toast.success("AP record deleted.");
    } catch (error) {
      setSavedPriorCredits(previous);
      toast.error(error instanceof Error ? error.message : "Unable to delete AP record.");
    }
  };

  const handleUpdateManualRecord = async () => {
    if (!editingManual) return;
    const credits = Number(editingManual.credits);
    if (!editingManual.originalName.trim() || !Number.isFinite(credits) || credits < 0) {
      toast.error("Provide a valid title and credits.");
      return;
    }

    const previous = savedPriorCredits;
    const optimistic: UserPriorCreditRecord = {
      id: editingManual.id,
      userId: savedPriorCredits.find((record) => record.id === editingManual.id)?.userId ?? "",
      sourceType: editingManual.sourceType,
      originalName: editingManual.originalName.trim(),
      umdCourseCode: editingManual.umdCourseCode.trim() || undefined,
      credits,
      genEdCodes: parseGenEdCodes(editingManual.genEdCodes),
      termAwarded: editingManual.termAwarded.trim() || undefined,
      createdAt: savedPriorCredits.find((record) => record.id === editingManual.id)?.createdAt ?? new Date().toISOString(),
    };

    setSavedPriorCredits((prev) => prev.map((record) => (record.id === optimistic.id ? optimistic : record)));
    try {
      const updated = await updatePriorCredit(editingManual.id, {
        originalName: optimistic.originalName,
        umdCourseCode: optimistic.umdCourseCode,
        credits: optimistic.credits,
        genEdCodes: optimistic.genEdCodes,
        termAwarded: optimistic.termAwarded,
      });
      setSavedPriorCredits((prev) => prev.map((record) => (record.id === updated.id ? updated : record)));
      setEditingManual(null);
      setLastSavedAt(new Date().toISOString());
      toast.success("Record updated.");
    } catch (error) {
      setSavedPriorCredits(previous);
      toast.error(error instanceof Error ? error.message : "Unable to update record.");
    }
  };

  const handleDeleteManualRecord = async (recordId: string) => {
    const previous = savedPriorCredits;
    setSavedPriorCredits((prev) => prev.filter((record) => record.id !== recordId));
    try {
      await deletePriorCredit(recordId);
      setLastSavedAt(new Date().toISOString());
      toast.success("Record deleted.");
    } catch (error) {
      setSavedPriorCredits(previous);
      toast.error(error instanceof Error ? error.message : "Unable to delete record.");
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
            <p className="text-neutral-400">Import AP, IB, and transfer credits to apply mapped courses, Gen Ed tags, and elective totals to your audit.</p>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button type="button" variant={activeSource === "AP" ? "default" : "outline"} className={activeSource === "AP" ? "bg-red-600 hover:bg-red-700" : "border-neutral-700 text-neutral-300"} onClick={() => setActiveSource("AP")}>AP</Button>
            <Button type="button" variant={activeSource === "IB" ? "default" : "outline"} className={activeSource === "IB" ? "bg-red-600 hover:bg-red-700" : "border-neutral-700 text-neutral-300"} onClick={() => { setManualCreditForm((prev) => ({ ...prev, sourceType: "IB" })); setActiveSource("IB"); }}>IB</Button>
            <Button type="button" variant={activeSource === "transfer" ? "default" : "outline"} className={activeSource === "transfer" ? "bg-red-600 hover:bg-red-700" : "border-neutral-700 text-neutral-300"} onClick={() => { setManualCreditForm((prev) => ({ ...prev, sourceType: "transfer" })); setActiveSource("transfer"); }}>Transfer</Button>
            <span className="ml-auto text-xs text-neutral-400">{formatLastSavedLabel(lastSavedAt)}</span>
          </div>

          {activeSource === "AP" && (
            <div className="space-y-6">
              {apSelections.map((credit, index) => {
                const exam = AP_CREDIT_CATALOG.find((item) => item.id === credit.examId);
                const scoreNumber = Number(credit.score);
                const award = Number.isFinite(scoreNumber) ? getApAward(credit.examId, scoreNumber) : null;
                return (
                  <div key={index} className="p-4 bg-[#1a1a1a] rounded-lg border border-neutral-800">
                    <div className="flex items-start justify-between mb-4">
                      <h3 className="text-white">AP Credit {index + 1}</h3>
                      {apSelections.length > 1 && <Button size="icon" variant="ghost" onClick={() => setApSelections((prev) => prev.filter((_, i) => i !== index))} className="hover:bg-red-600/20 hover:text-red-400"><X className="w-4 h-4" /></Button>}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>AP Exam</Label>
                        <Select value={credit.examId} onValueChange={(value) => setApSelections((prev) => prev.map((item, i) => i === index ? { ...item, examId: value } : item))}>
                          <SelectTrigger className="bg-[#252525] border-neutral-700"><SelectValue placeholder="Select an AP exam" /></SelectTrigger>
                          <SelectContent>{AP_CREDIT_CATALOG.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}{item.apNumber ? ` (${item.apNumber})` : ""}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Score</Label>
                        <Select value={credit.score} onValueChange={(value) => setApSelections((prev) => prev.map((item, i) => i === index ? { ...item, score: value } : item))}>
                          <SelectTrigger className="bg-[#252525] border-neutral-700"><SelectValue placeholder="Select score" /></SelectTrigger>
                          <SelectContent>{[1, 2, 3, 4, 5].map((score) => <SelectItem key={score} value={String(score)}>{score}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="md:col-span-2 rounded-lg border border-neutral-700 bg-[#252525] p-3">
                        <div className="flex items-center gap-2 mb-2 text-sm text-neutral-300"><CheckCircle2 className="h-4 w-4 text-green-400" />Award Preview</div>
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
                      {exam && <div className="md:col-span-2 text-xs text-neutral-500">Source: UMD AP Gen Ed chart (2023-2025 exams)</div>}
                    </div>
                  </div>
                );
              })}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border border-neutral-800 bg-[#1a1a1a] p-3"><p className="text-xs text-neutral-400">Total AP Credits</p><p className="text-xl text-white">{totals.totalCredits}</p></div>
                <div className="rounded-lg border border-neutral-800 bg-[#1a1a1a] p-3"><p className="text-xs text-neutral-400">Mapped Courses</p><p className="text-xl text-white">{totals.totalCourses}</p></div>
                <div className="rounded-lg border border-neutral-800 bg-[#1a1a1a] p-3"><p className="text-xs text-neutral-400">Gen Ed Tags Applied</p><p className="text-xl text-white">{totals.totalGenEds}</p></div>
              </div>

              <Button variant="outline" onClick={() => setApSelections((prev) => [...prev, { examId: "", score: "" }])} className="w-full border-neutral-700 text-neutral-300 hover:bg-neutral-800"><Plus className="w-4 h-4 mr-2" />Add Another AP Exam</Button>
              <Button onClick={() => void handleSaveAp()} className="w-full bg-green-700 hover:bg-green-600" disabled={saving}>{saving ? "Saving AP Credits..." : "Save AP Credits"}</Button>

              <div className="rounded-lg border border-neutral-800 bg-[#1a1a1a] p-4">
                <h3 className="text-white mb-3">Saved AP Records</h3>
                {loadingSaved ? (
                  <p className="text-sm text-neutral-400">Loading saved AP records...</p>
                ) : apSavedRecords.length === 0 ? (
                  <p className="text-sm text-neutral-400">No saved AP records yet.</p>
                ) : (
                  <div className="space-y-3">
                    {apSavedRecords.map((record) => (
                      <div key={record.id} className="rounded-md border border-neutral-700 bg-[#252525] p-3">
                        {editingAp?.id === record.id ? (
                          <div className="space-y-3">
                            <div><Label>Title</Label><Input value={editingAp.originalName} onChange={(event) => setEditingAp((prev) => prev ? { ...prev, originalName: event.target.value } : prev)} className="bg-[#1a1a1a] border-neutral-700" /></div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div><Label>UMD Course</Label><Input value={editingAp.umdCourseCode} onChange={(event) => setEditingAp((prev) => prev ? { ...prev, umdCourseCode: event.target.value } : prev)} className="bg-[#1a1a1a] border-neutral-700" /></div>
                              <div><Label>Credits</Label><Input value={editingAp.credits} onChange={(event) => setEditingAp((prev) => prev ? { ...prev, credits: event.target.value } : prev)} className="bg-[#1a1a1a] border-neutral-700" /></div>
                              <div><Label>Term</Label><Input value={editingAp.termAwarded} onChange={(event) => setEditingAp((prev) => prev ? { ...prev, termAwarded: event.target.value } : prev)} className="bg-[#1a1a1a] border-neutral-700" /></div>
                            </div>
                            <div><Label>Gen Ed Tags (comma-separated)</Label><Input value={editingAp.genEdCodes} onChange={(event) => setEditingAp((prev) => prev ? { ...prev, genEdCodes: event.target.value } : prev)} className="bg-[#1a1a1a] border-neutral-700" /></div>
                            <div className="flex gap-2">
                              <Button className="bg-green-700 hover:bg-green-600" onClick={() => void handleUpdateApRecord()}>Save</Button>
                              <Button variant="outline" className="border-neutral-700 text-neutral-300" onClick={() => setEditingAp(null)}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm text-neutral-200">
                              <p className="font-medium text-white">{record.originalName}</p>
                              <p className="text-neutral-400">Course: {record.umdCourseCode ?? "Elective/unspecified"}</p>
                              <p className="text-neutral-400">Credits: {record.credits} | Gen Ed: {record.genEdCodes.length > 0 ? record.genEdCodes.join(", ") : "None"}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button size="icon" variant="ghost" className="hover:bg-neutral-700" onClick={() => setEditingAp({ id: record.id, originalName: record.originalName, umdCourseCode: record.umdCourseCode ?? "", credits: String(record.credits), genEdCodes: record.genEdCodes.join(", "), termAwarded: record.termAwarded ?? "Prior to UMD" })}><Pencil className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" className="hover:bg-red-600/20 hover:text-red-400" onClick={() => void handleDeleteApRecord(record.id)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {(activeSource === "IB" || activeSource === "transfer") && (
            <div className="space-y-4">
              <div className="rounded-lg border border-neutral-800 bg-[#1a1a1a] p-4">
                <h3 className="text-white mb-3">{activeSource === "IB" ? "IB Credit Import" : "Transfer Credit Import"}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><Label>{activeSource === "IB" ? "IB Exam / Subject" : "Original Course Title"}</Label><Input value={manualCreditForm.originalName} onChange={(event) => setManualCreditForm((prev) => ({ ...prev, originalName: event.target.value }))} className="bg-[#252525] border-neutral-700" placeholder={activeSource === "IB" ? "IB Biology HL" : "ENG 101 Composition"} /></div>
                  <div><Label>UMD Course Equivalent (optional)</Label><Input value={manualCreditForm.umdCourseCode} onChange={(event) => setManualCreditForm((prev) => ({ ...prev, umdCourseCode: event.target.value.toUpperCase() }))} className="bg-[#252525] border-neutral-700" placeholder="BSCI160" /></div>
                  <div><Label>Credits</Label><Input value={manualCreditForm.credits} onChange={(event) => setManualCreditForm((prev) => ({ ...prev, credits: event.target.value }))} className="bg-[#252525] border-neutral-700" placeholder="3" /></div>
                  <div><Label>Gen Ed Tags (comma-separated)</Label><Input value={manualCreditForm.genEdCodes} onChange={(event) => setManualCreditForm((prev) => ({ ...prev, genEdCodes: event.target.value }))} className="bg-[#252525] border-neutral-700" placeholder="DSNS, SCIS" /></div>
                  <div className="md:col-span-2"><Label>Term Awarded</Label><Input value={manualCreditForm.termAwarded} onChange={(event) => setManualCreditForm((prev) => ({ ...prev, termAwarded: event.target.value }))} className="bg-[#252525] border-neutral-700" placeholder="Prior to UMD" /></div>
                </div>
                {activeSource === "transfer" && <p className="mt-3 text-sm text-neutral-400">Need UMD transfer equivalencies? Use the Transfer Credit Services database: <a href="https://app.transfercredit.umd.edu/" className="text-blue-400 underline" target="_blank" rel="noreferrer">app.transfercredit.umd.edu</a></p>}
                <Button className="mt-4 w-full bg-green-700 hover:bg-green-600" onClick={() => void handleManualImport()} disabled={saving}>{saving ? "Saving..." : `Save ${activeSource === "IB" ? "IB" : "Transfer"} Credit`}</Button>
              </div>

              <div className="rounded-lg border border-neutral-800 bg-[#1a1a1a] p-4">
                <h3 className="text-white mb-3">Saved {activeSource === "IB" ? "IB" : "Transfer"} Records</h3>
                <div className="mb-3">
                  <Input
                    value={manualSearchQuery}
                    onChange={(event) => setManualSearchQuery(event.target.value)}
                    placeholder={`Filter saved ${activeSource === "IB" ? "IB" : "transfer"} records`}
                    className="bg-[#252525] border-neutral-700"
                  />
                </div>
                {loadingSaved ? (
                  <p className="text-sm text-neutral-400">Loading saved records...</p>
                ) : filteredManualSavedRecords.length === 0 ? (
                  <p className="text-sm text-neutral-400">No saved records yet.</p>
                ) : (
                  <div className="space-y-3">
                    {filteredManualSavedRecords.map((record) => (
                      <div key={record.id} className="rounded-md border border-neutral-700 bg-[#252525] p-3">
                        {editingManual?.id === record.id ? (
                          <div className="space-y-3">
                            <div><Label>Title</Label><Input value={editingManual.originalName} onChange={(event) => setEditingManual((prev) => prev ? { ...prev, originalName: event.target.value } : prev)} className="bg-[#1a1a1a] border-neutral-700" /></div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div><Label>UMD Course</Label><Input value={editingManual.umdCourseCode} onChange={(event) => setEditingManual((prev) => prev ? { ...prev, umdCourseCode: event.target.value.toUpperCase() } : prev)} className="bg-[#1a1a1a] border-neutral-700" /></div>
                              <div><Label>Credits</Label><Input value={editingManual.credits} onChange={(event) => setEditingManual((prev) => prev ? { ...prev, credits: event.target.value } : prev)} className="bg-[#1a1a1a] border-neutral-700" /></div>
                              <div><Label>Term</Label><Input value={editingManual.termAwarded} onChange={(event) => setEditingManual((prev) => prev ? { ...prev, termAwarded: event.target.value } : prev)} className="bg-[#1a1a1a] border-neutral-700" /></div>
                            </div>
                            <div><Label>Gen Ed Tags (comma-separated)</Label><Input value={editingManual.genEdCodes} onChange={(event) => setEditingManual((prev) => prev ? { ...prev, genEdCodes: event.target.value } : prev)} className="bg-[#1a1a1a] border-neutral-700" /></div>
                            <div className="flex gap-2">
                              <Button className="bg-green-700 hover:bg-green-600" onClick={() => void handleUpdateManualRecord()}>Save</Button>
                              <Button variant="outline" className="border-neutral-700 text-neutral-300" onClick={() => setEditingManual(null)}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm text-neutral-200">
                              <p className="font-medium text-white">{record.originalName}</p>
                              <p className="text-neutral-400">Course: {record.umdCourseCode ?? "Elective/unspecified"}</p>
                              <p className="text-neutral-400">Credits: {record.credits} | Gen Ed: {record.genEdCodes.length > 0 ? record.genEdCodes.join(", ") : "None"}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button size="icon" variant="ghost" className="hover:bg-neutral-700" onClick={() => setEditingManual({ id: record.id, sourceType: record.sourceType as "IB" | "transfer", originalName: record.originalName, umdCourseCode: record.umdCourseCode ?? "", credits: String(record.credits), genEdCodes: record.genEdCodes.join(", "), termAwarded: record.termAwarded ?? "Prior to UMD" })}><Pencil className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" className="hover:bg-red-600/20 hover:text-red-400" onClick={() => void handleDeleteManualRecord(record.id)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-4 p-4 bg-blue-600/10 border border-blue-600/30 rounded-lg"><p className="text-sm text-blue-400">Saved prior credits are applied to Gen Eds, degree audit requirements, and total/elective credit calculations.</p></div>

          <div className="flex gap-3 mt-8">
            <Button variant="outline" onClick={() => navigate("/onboarding/goals")} className="border-neutral-700 text-neutral-300 hover:bg-neutral-800">Back</Button>
            <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={() => navigate("/gen-eds")}>Next: Gen Eds</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
