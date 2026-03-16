import { useMemo, useState } from "react";
import { Bug, Lightbulb, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";

type SuggestionType = "feature" | "bug" | "other";

type StoredSuggestion = {
  id: string;
  createdAt: string;
  type: SuggestionType;
  title: string;
  details: string;
  contact: string;
};

const STORAGE_KEY = "orbitumd:suggestions:v1";

function loadSuggestions(): StoredSuggestion[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredSuggestion[]) : [];
  } catch {
    return [];
  }
}

function saveSuggestions(suggestions: StoredSuggestion[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(suggestions));
}

export default function Suggestions() {
  const [type, setType] = useState<SuggestionType>("feature");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [contact, setContact] = useState("");

  const contactEmailHref = useMemo(() => {
    const subject = encodeURIComponent("OrbitUMD feedback");
    const body = encodeURIComponent("Share your suggestion or issue details here.");
    return `mailto:orbitumd@umd.edu?subject=${subject}&body=${body}`;
  }, []);

  const submitSuggestion = () => {
    const normalizedTitle = title.trim();
    const normalizedDetails = details.trim();
    const normalizedContact = contact.trim();

    if (!normalizedTitle || !normalizedDetails) {
      toast.error("Please include both a title and details.");
      return;
    }

    const next: StoredSuggestion = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      type,
      title: normalizedTitle,
      details: normalizedDetails,
      contact: normalizedContact,
    };

    const existing = loadSuggestions();
    saveSuggestions([next, ...existing].slice(0, 50));

    setTitle("");
    setDetails("");
    setContact("");

    toast.success("Suggestion saved. Thank you for helping improve OrbitUMD.");
  };

  return (
    <div className="p-6 max-w-4xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Suggestions & Help</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Report a problem, request a feature, or contact the team.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <h2 className="font-medium">Feature Requests</h2>
          </div>
          <p className="text-sm text-muted-foreground">Tell us what you want OrbitUMD to do next.</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Bug className="w-4 h-4 text-red-400" />
            <h2 className="font-medium">Problems & Bugs</h2>
          </div>
          <p className="text-sm text-muted-foreground">Include steps to reproduce and what you expected.</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Mail className="w-4 h-4 text-blue-400" />
            <h2 className="font-medium">Contact</h2>
          </div>
          <a className="text-sm underline text-foreground" href={contactEmailHref}>Email the OrbitUMD team</a>
        </Card>
      </div>

      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold">Send Feedback</h2>

        <div className="flex flex-wrap gap-2">
          <Button variant={type === "feature" ? "default" : "outline"} onClick={() => setType("feature")}>Feature</Button>
          <Button variant={type === "bug" ? "default" : "outline"} onClick={() => setType("bug")}>Bug</Button>
          <Button variant={type === "other" ? "default" : "outline"} onClick={() => setType("other")}>Other</Button>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Title</label>
          <Input
            placeholder="Short summary"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Details</label>
          <Textarea
            placeholder="What happened, what you expected, and any context that can help."
            className="min-h-36"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Contact (optional)</label>
          <Input
            placeholder="Email or Discord handle"
            value={contact}
            onChange={(event) => setContact(event.target.value)}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={submitSuggestion}>
            <Send className="w-4 h-4 mr-2" />
            Submit
          </Button>
        </div>
      </Card>
    </div>
  );
}