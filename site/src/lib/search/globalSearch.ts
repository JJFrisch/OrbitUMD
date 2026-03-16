import { plannerApi } from "@/lib/api/planner";
import requirementsCatalog from "@/lib/data/umd_program_requirements.json";

export type GlobalSearchResult = {
  id: string;
  kind: "course" | "requirement" | "program" | "page" | "help";
  title: string;
  summary: string;
  detail: string;
  path?: string;
  score: number;
  actionLabel?: string;
};

type SearchDoc = {
  id: string;
  kind: GlobalSearchResult["kind"];
  title: string;
  summary: string;
  detail: string;
  path?: string;
  searchable: string;
};

type CatalogProgram = {
  id: string;
  name: string;
  type?: string;
  specializations?: string[];
  builderSections?: Array<{
    title?: string;
    rules?: string[];
    chooseCount?: number;
    items?: Array<{ code?: string; type?: string; items?: Array<{ code?: string }> }>;
  }>;
};

const PAGE_DOCS: SearchDoc[] = [
  {
    id: "page-dashboard",
    kind: "page",
    title: "Dashboard",
    summary: "Overview of progress, recommendations, and planning health.",
    detail: "Use the dashboard to review the current state of your plan and requirement progress.",
    path: "/dashboard",
    searchable: "dashboard overview progress recommendations planning health home",
  },
  {
    id: "page-schedule-builder",
    kind: "page",
    title: "Schedule Builder",
    summary: "Search Testudo courses, compare sections, and build a weekly schedule.",
    detail: "Best place for live course lookups, section conflicts, and registration planning.",
    path: "/schedule-builder",
    searchable: "schedule builder testudo courses sections weekly planner registration classes",
  },
  {
    id: "page-degree-audit",
    kind: "page",
    title: "Degree Audit",
    summary: "Understand what requirements are done, in progress, or still missing.",
    detail: "Best place for requirement-by-requirement progress and unmet sections.",
    path: "/degree-audit",
    searchable: "degree audit requirements missing progress unmet sections graduation",
  },
  {
    id: "page-degree-requirements",
    kind: "page",
    title: "Degree Requirements",
    summary: "Browse the structured requirement definitions for selected programs.",
    detail: "Best place to inspect official or derived requirement section content.",
    path: "/degree-requirements",
    searchable: "degree requirements sections program rules official templates requirement definitions",
  },
  {
    id: "page-suggestions",
    kind: "help",
    title: "Suggestions & Help",
    summary: "Report problems, request features, or contact the team.",
    detail: "Use this page when search does not answer your question directly.",
    path: "/suggestions",
    searchable: "suggestions help support bug feature contact feedback issue report",
  },
];

let cachedDocs: SearchDoc[] | null = null;

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

function extractCodes(section: CatalogProgram["builderSections"][number]): string[] {
  const direct = (section.items ?? []).flatMap((item) => {
    const codes = [item.code].filter((code): code is string => Boolean(code));
    const nested = (item.items ?? []).map((child) => child.code).filter((code): code is string => Boolean(code));
    return [...codes, ...nested];
  });
  return Array.from(new Set(direct.map((code) => code.toUpperCase())));
}

function buildDocs(): SearchDoc[] {
  if (cachedDocs) return cachedDocs;

  const docs: SearchDoc[] = [...PAGE_DOCS];
  const programs = ((requirementsCatalog as { programs?: CatalogProgram[] }).programs ?? []);

  for (const program of programs) {
    const overview = (program.specializations ?? []).slice(0, 2).join(" ");
    docs.push({
      id: `program:${program.id}`,
      kind: "program",
      title: program.name,
      summary: `${program.type === "minor" ? "Minor" : "Major"} requirement overview`,
      detail: overview || "Catalog-backed program requirement content.",
      path: "/degree-requirements",
      searchable: normalizeText(`${program.name} ${program.type ?? ""} ${overview}`),
    });

    for (const [index, section] of (program.builderSections ?? []).entries()) {
      const rules = (section.rules ?? []).slice(0, 4).join(" • ");
      const codes = extractCodes(section);
      const chooseText = typeof section.chooseCount === "number" ? `Choose ${section.chooseCount}` : "All required";
      docs.push({
        id: `requirement:${program.id}:${index}`,
        kind: "requirement",
        title: section.title?.trim() || `${program.name} Requirement ${index + 1}`,
        summary: `${program.name} • ${chooseText}`,
        detail: rules || (codes.length > 0 ? `Relevant courses: ${codes.slice(0, 6).join(", ")}` : "Requirement section from the academic catalog."),
        path: "/degree-requirements",
        searchable: normalizeText(`${program.name} ${section.title ?? ""} ${rules} ${codes.join(" ")}`),
      });
    }
  }

  cachedDocs = docs;
  return docs;
}

function scoreDoc(queryTokens: string[], doc: SearchDoc): number {
  const title = normalizeText(doc.title);
  const summary = normalizeText(doc.summary);
  const detail = normalizeText(doc.detail);
  let score = 0;

  for (const token of queryTokens) {
    if (title.includes(token)) score += 7;
    if (summary.includes(token)) score += 4;
    if (detail.includes(token)) score += 2;
    if (doc.searchable.includes(token)) score += 1;
  }

  return score;
}

export async function searchOrbitContent(query: string): Promise<GlobalSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const queryTokens = tokenize(trimmed);
  const staticResults = buildDocs()
    .map((doc) => ({ doc, score: scoreDoc(queryTokens, doc) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ doc, score }) => ({
      id: doc.id,
      kind: doc.kind,
      title: doc.title,
      summary: doc.summary,
      detail: doc.detail,
      path: doc.path,
      actionLabel: doc.path ? "Open" : undefined,
      score,
    } satisfies GlobalSearchResult));

  let courseResults: GlobalSearchResult[] = [];
  if (trimmed.length >= 3) {
    try {
      const courses = await plannerApi.searchCoursesAcrossRecentTerms(trimmed);
      courseResults = courses.slice(0, 6).map((course, index) => ({
        id: `course:${course.id}:${index}`,
        kind: "course",
        title: `${course.id} • ${course.title}`,
        summary: `${course.credits} credits${course.genEdTags.length > 0 ? ` • ${course.genEdTags.join(", ")}` : ""}`,
        detail: course.description?.trim() || course.relationships?.prereqs?.trim() || "Course result from recent Testudo/catalog terms.",
        path: `/schedule-builder?query=${encodeURIComponent(course.id)}`,
        actionLabel: "Search course",
        score: 100 - index,
      }));
    } catch {
      courseResults = [];
    }
  }

  const merged = [...courseResults, ...staticResults]
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  if (merged.length > 0) {
    return merged;
  }

  return [
    {
      id: `help:${trimmed}`,
      kind: "help",
      title: "No direct answer found",
      summary: "Try Suggestions & Help for a manual answer or feature request.",
      detail: `Search did not find a confident match for "${trimmed}" across pages, requirements, or recent course data.`,
      path: "/suggestions",
      actionLabel: "Open help",
      score: 1,
    },
  ];
}