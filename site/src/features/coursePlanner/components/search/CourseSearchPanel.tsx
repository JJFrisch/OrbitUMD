import { Search, Loader2, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CourseCard } from "./CourseCard";
import { CourseFilters } from "./CourseFilters";
import { useCoursePlannerStore } from "../../state/coursePlannerStore";

const PAGE_SIZE = 50;

export function CourseSearchPanel() {
  const searchInput = useCoursePlannerStore((state) => state.searchInput);
  const filters = useCoursePlannerStore((state) => state.filters);
  const term = useCoursePlannerStore((state) => state.term);
  const year = useCoursePlannerStore((state) => state.year);
  const setSearchInput = useCoursePlannerStore((state) => state.setSearchInput);
  const executeSearch = useCoursePlannerStore((state) => state.executeSearch);
  const pending = useCoursePlannerStore((state) => state.searchPending);
  const error = useCoursePlannerStore((state) => state.searchError);
  const results = useCoursePlannerStore((state) => state.searchResults);
  const suggestions = useCoursePlannerStore((state) => state.suggestions);
  const highlightedSuggestionIndex = useCoursePlannerStore((state) => state.highlightedSuggestionIndex);
  const highlightSuggestion = useCoursePlannerStore((state) => state.highlightSuggestion);
  const applyHighlightedSuggestion = useCoursePlannerStore((state) => state.applyHighlightedSuggestion);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const visibleResults = useMemo(() => results.slice(0, visibleCount), [results, visibleCount]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void executeSearch();
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [executeSearch, searchInput, filters, term, year]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchInput, filters, term, year]);

  return (
    <aside className={`cp-search-panel ${filtersExpanded ? "is-filters-expanded" : "is-filters-collapsed"}`}>
      <div className="cp-search-box">
        <Search size={14} />
        <input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search courses"
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              highlightSuggestion(1);
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              highlightSuggestion(-1);
            }
            if (event.key === "Enter" && suggestions.length > 0) {
              event.preventDefault();
              applyHighlightedSuggestion();
            }
          }}
        />
      </div>

      {suggestions.length > 0 && (
        <div className="cp-suggestions" role="listbox">
          {suggestions.map((suggestion, idx) => (
            <button
              key={suggestion}
              className={idx === highlightedSuggestionIndex ? "is-active" : ""}
              onClick={() => setSearchInput(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        className="cp-filters-toggle"
        onClick={() => setFiltersExpanded(!filtersExpanded)}
        aria-label={filtersExpanded ? "Collapse filters" : "Expand filters"}
        aria-expanded={filtersExpanded}
      >
        <span>Filters</span>
        <ChevronDown size={14} className={`cp-filters-toggle-chevron${filtersExpanded ? " is-open" : ""}`} />
      </button>

      {filtersExpanded && <CourseFilters />}

      {pending && (
        <div className="cp-inline-loading"><Loader2 size={14} className="spin" /> Searching...</div>
      )}

      {error && <p className="cp-error-text">{error}</p>}

      <div className="cp-results-list">
        {visibleResults.map((course, idx) => (
          <CourseCard
            key={course.id}
            course={course}
            autoLoadSections
            preloadDelayMs={idx * 25}
          />
        ))}
        {!pending && results.length === 0 && <p className="cp-muted-text">No courses found.</p>}

        {!pending && results.length > visibleCount && (
          <button
            type="button"
            className="cp-ghost-btn"
            onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
          >
            Load more ({Math.min(PAGE_SIZE, results.length - visibleCount)} more)
          </button>
        )}
      </div>
    </aside>
  );
}
