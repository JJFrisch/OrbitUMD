import { useRef, useState } from "react";
import { FileUp, LoaderCircle, RefreshCcw, Upload } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "./ui/utils";
import {
  parseUnofficialTranscriptFile,
  type TranscriptParseResult,
} from "@/lib/transcripts/unofficialTranscriptParser";

interface TranscriptUploadPanelProps {
  className?: string;
  instructions?: string[];
  onParsed?: (result: TranscriptParseResult) => void | Promise<void>;
}

function buildSummaryRows(result: TranscriptParseResult): Array<{ label: string; value: string }> {
  const { fields } = result;
  const rows = [
    { label: "Name", value: fields.fullName ?? "" },
    { label: "Email", value: fields.email ?? "" },
    { label: "UID", value: fields.universityUid ?? "" },
    { label: "Major", value: fields.major ?? "" },
    { label: "Degree", value: fields.degree ?? "" },
    { label: "Class Standing", value: fields.classStanding ?? "" },
    { label: "Cumulative GPA", value: fields.cumulativeGpa ?? "" },
    { label: "Admit Term", value: fields.admitTerm ?? "" },
    { label: "Graduation Year", value: fields.graduationYear ?? "" },
    { label: "Institution", value: fields.college ?? "" },
  ].filter((row) => row.value.trim().length > 0);

  if (result.summary.totalParsedCourses > 0) {
    rows.push({ label: "Imported Prior-Credit Rows", value: String(result.summary.totalParsedCourses) });
    rows.push({ label: "Courses Counting Toward Progress", value: String(result.summary.totalPassingCourses) });
  }
  if (result.summary.apEquivalencyCount > 0) {
    rows.push({ label: "AP Equivalencies", value: String(result.summary.apEquivalencyCount) });
  }
  if (result.summary.transferCourseCount > 0) {
    rows.push({ label: "Transfer Courses", value: String(result.summary.transferCourseCount) });
  }
  if (result.summary.historicCourseCount > 0) {
    rows.push({ label: "Historic UMD Courses", value: String(result.summary.historicCourseCount) });
  }
  if (result.summary.currentCourseCount > 0) {
    rows.push({ label: "Current Courses", value: String(result.summary.currentCourseCount) });
  }
  if (result.summary.totalApplicableTransferCredits !== null) {
    rows.push({ label: "Transfer Credits Applicable", value: String(result.summary.totalApplicableTransferCredits) });
  }
  if (result.summary.totalCreditsEarned !== null) {
    rows.push({ label: "UG Cumulative Credit", value: String(result.summary.totalCreditsEarned) });
  }
  if (result.summary.totalCreditsAttempted !== null) {
    rows.push({ label: "UG Attempted Credits", value: String(result.summary.totalCreditsAttempted) });
  }
  return rows;
}

export default function TranscriptUploadPanel({
  className,
  instructions = [],
  onParsed,
}: TranscriptUploadPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TranscriptParseResult | null>(null);

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setError("Upload a PDF exported from Testudo.");
      return;
    }

    setParsing(true);
    setError(null);
    try {
      const parsed = await parseUnofficialTranscriptFile(file);
      setResult(parsed);
      await onParsed?.(parsed);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to parse that transcript PDF.");
    } finally {
      setParsing(false);
    }
  };

  const summaryRows = result ? buildSummaryRows(result) : [];

  return (
    <div className={cn("space-y-4", className)}>
      {instructions.length > 0 && (
        <div className="rounded-lg border border-border bg-input-background p-4 text-sm text-muted-foreground">
          {instructions.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          const nextFile = event.target.files?.[0] ?? null;
          void handleFile(nextFile);
          event.target.value = "";
        }}
      />

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          const nextFile = event.dataTransfer.files?.[0] ?? null;
          void handleFile(nextFile);
        }}
        className={cn(
          "rounded-xl border border-dashed p-6 transition-colors cursor-pointer",
          dragActive ? "border-red-500 bg-red-500/5" : "border-border bg-card hover:bg-accent/40",
        )}
      >
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          {parsing ? (
            <LoaderCircle className="h-8 w-8 animate-spin text-red-500" />
          ) : (
            <Upload className="h-8 w-8 text-red-500" />
          )}
          <div>
            <p className="text-base text-foreground">
              {parsing ? "Parsing unofficial transcript..." : "Drag and drop your Testudo PDF here"}
            </p>
            <p className="text-sm text-muted-foreground">
              {parsing ? "This usually takes a few seconds." : "Or click to choose a file."}
            </p>
          </div>
          {!parsing && (
            <Button type="button" variant="outline" className="border-border" onClick={(event) => {
              event.stopPropagation();
              inputRef.current?.click();
            }}>
              <FileUp className="mr-2 h-4 w-4" />
              Choose PDF
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-border bg-input-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-foreground">Parsed {result.fileName}</p>
              <p className="text-xs text-muted-foreground">
                {result.pageCount > 0 ? `${result.pageCount} page${result.pageCount === 1 ? "" : "s"}` : "PDF parsed"}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" className="border-border" onClick={() => inputRef.current?.click()}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Replace File
            </Button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {summaryRows.length > 0 ? summaryRows.map((row) => (
              <div key={row.label} className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{row.label}</p>
                <p className="mt-1 text-sm text-foreground">{row.value}</p>
              </div>
            )) : (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100 md:col-span-2">
                The PDF text was readable, but OrbitUMD could not confidently extract profile fields. You can still fill them in manually.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
