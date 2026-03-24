import { useEffect, useState } from "react";
import { Bug, Lightbulb, Mail, Send } from "lucide-react";
import { useLocation } from "react-router";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { createUserFeedbackSubmission, listUserFeedbackSubmissions, type FeedbackType, type UserFeedbackSubmission } from "@/lib/repositories/userFeedbackRepository";

export default function Suggestions() {
  const location = useLocation();
  const [type, setType] = useState<FeedbackType>("feature");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<UserFeedbackSubmission[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    let active = true;
    void listUserFeedbackSubmissions()
      .then((rows) => {
        if (!active) return;
        setHistory(rows);
      })
      .catch((error) => {
        if (!active) return;
        toast.error(error instanceof Error ? error.message : "Unable to load feedback history.");
      })
      .finally(() => {
        if (active) setLoadingHistory(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const submitSuggestion = async () => {
    const normalizedTitle = title.trim();
    const normalizedDetails = details.trim();
    const normalizedContact = contact.trim();

    if (!normalizedTitle || !normalizedDetails) {
      toast.error("Please include both a title and details.");
      return;
    }

    setSubmitting(true);
    try {
      const created = await createUserFeedbackSubmission({
        feedbackType: type,
        title: normalizedTitle,
        details: normalizedDetails,
        contact: normalizedContact || undefined,
        pagePath: location.pathname,
      });

      setHistory((prev) => [created, ...prev].slice(0, 20));
      setTitle("");
      setDetails("");
      setContact("");
      toast.success("Feedback saved to OrbitUMD.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit feedback.");
    } finally {
      setSubmitting(false);
    }
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
          <p className="text-sm text-muted-foreground">Use the form below and include contact details if you want a follow-up.</p>
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
            className="border-border shadow-sm"
            placeholder="Short summary"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Details</label>
          <Textarea
            placeholder="What happened, what you expected, and any context that can help."
            className="min-h-36 border-border shadow-sm"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Contact (optional)</label>
          <Input
            className="border-border shadow-sm"
            placeholder="Email or Discord handle"
            value={contact}
            onChange={(event) => setContact(event.target.value)}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={() => void submitSuggestion()} disabled={submitting}>
            <Send className="w-4 h-4 mr-2" />
            {submitting ? "Submitting..." : "Submit"}
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold">Recent Submissions</h2>
        {loadingHistory ? <p className="text-sm text-muted-foreground">Loading your recent feedback...</p> : null}
        {!loadingHistory && history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No feedback submitted yet.</p>
        ) : null}
        <div className="space-y-3">
          {history.map((item) => (
            <div key={item.id} className="rounded-lg border border-border bg-input-background p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.feedbackType} • {new Date(item.createdAt).toLocaleString()}</p>
                </div>
                <span className="rounded-full border border-border px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">{item.status}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">{item.details}</p>
              {item.contact ? <p className="text-xs text-muted-foreground mt-2">Contact: {item.contact}</p> : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}