import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { CircleHelp, Search, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { searchOrbitContent, type GlobalSearchResult } from "@/lib/search/globalSearch";

export function GlobalSearchPanel() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GlobalSearchResult[]>([]);

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) {
      setResults([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    const timeout = window.setTimeout(() => {
      void searchOrbitContent(normalized)
        .then((next) => {
          if (!active) return;
          setResults(next);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [query]);

  return (
    <Card className="p-4 bg-card border-border space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Search className="w-4 h-4 text-blue-400" />
          <h2 className="text-lg font-semibold">Global Search</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Search pages, requirement content, and recent course data from one place.
        </p>
      </div>

      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search anything in OrbitUMD"
        className="bg-input-background border-border"
      />

      {loading ? <p className="text-sm text-muted-foreground">Searching pages, requirements, and courses...</p> : null}

      {!loading && query.trim() && results.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
          No results yet. Try a course code, program name, requirement topic, or help.
        </div>
      ) : null}

      <div className="space-y-3">
        {results.map((result) => (
          <div key={result.id} className="rounded-lg border border-border bg-input-background p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{result.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{result.summary}</p>
                <p className="text-xs text-muted-foreground mt-2">{result.detail}</p>
              </div>
              <span className="shrink-0 rounded-full border border-border px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {result.kind}
              </span>
            </div>

            {result.path ? (
              <div className="mt-3 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-border"
                  onClick={() => navigate(result.path!)}
                >
                  {result.kind === "help" ? <CircleHelp className="w-4 h-4 mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  {result.actionLabel ?? "Open"}
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}