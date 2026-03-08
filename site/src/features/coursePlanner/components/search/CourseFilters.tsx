import { Filter, RotateCcw } from "lucide-react";
import { useCoursePlannerStore } from "../../state/coursePlannerStore";
import { getAppliedFilterCount } from "../../utils/formatting";

const TERM_OPTIONS = ["", "Winter", "Spring", "Summer", "Fall"] as const;

export function CourseFilters() {
  const filters = useCoursePlannerStore((state) => state.filters);
  const setFilters = useCoursePlannerStore((state) => state.setFilters);
  const resetFilters = useCoursePlannerStore((state) => state.resetFilters);
  const appliedCount = getAppliedFilterCount(filters);

  return (
    <div className="cp-filters">
      <div className="cp-filters-header">
        <span className="cp-filters-title"><Filter size={14} /> Filters</span>
        {appliedCount > 0 && <span className="cp-chip">{appliedCount}</span>}
      </div>

      <div className="cp-filters-grid">
        <label>
          Gen-Ed
          <input
            value={filters.genEds.join(",")}
            onChange={(event) => {
              const genEds = event.target.value
                .toUpperCase()
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean);
              setFilters((current) => ({ ...current, genEds }));
            }}
            placeholder="FSMA,DSSP"
          />
        </label>

        <label>
          Instructor
          <input
            value={filters.instructorInput}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                instructorInput: event.target.value,
                instructor: undefined,
              }))
            }
            placeholder="partial name"
          />
        </label>

        <div className="cp-filter-row">
          <label>
            Min credits
            <input
              type="number"
              min={0}
              max={30}
              value={filters.minCredits ?? ""}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  minCredits: event.target.value ? Number(event.target.value) : null,
                }))
              }
            />
          </label>

          <label>
            Max credits
            <input
              type="number"
              min={0}
              max={30}
              value={filters.maxCredits ?? ""}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  maxCredits: event.target.value ? Number(event.target.value) : null,
                }))
              }
            />
          </label>
        </div>

        <label>
          Term override
          <select
            value={filters.searchTerm}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                searchTerm: event.target.value as typeof TERM_OPTIONS[number],
              }))
            }
          >
            <option value="">Default</option>
            {TERM_OPTIONS.filter(Boolean).map((term) => (
              <option key={term} value={term}>
                {term}
              </option>
            ))}
          </select>
        </label>

        <label className="cp-checkbox-label">
          <input
            type="checkbox"
            checked={filters.onlyOpen}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                onlyOpen: event.target.checked,
              }))
            }
          />
          Only open sections
        </label>
      </div>

      <button className="cp-ghost-btn" type="button" onClick={resetFilters}>
        <RotateCcw size={13} /> Reset filters
      </button>
    </div>
  );
}
