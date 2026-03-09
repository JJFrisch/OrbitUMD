import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { SectionRow } from "./SectionRow";
import { useCoursePlannerStore } from "../../state/coursePlannerStore";
import { formatCredits } from "../../utils/courseDetails";
import type { Course } from "../../types/coursePlanner";

interface CourseCardProps {
  course: Course;
  autoLoadSections?: boolean;
  preloadDelayMs?: number;
}

export function CourseCard({ course, autoLoadSections = false, preloadDelayMs = 0 }: CourseCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [hasRequestedSections, setHasRequestedSections] = useState(false);
  const loadSectionsForCourse = useCoursePlannerStore((state) => state.loadSectionsForCourse);
  const filters = useCoursePlannerStore((state) => state.filters);
  const [loading, setLoading] = useState(false);

  const sections = course.sections ?? [];
  const visibleSections = filters.onlyOpen ? sections.filter((section) => section.openSeats > 0) : sections;

  useEffect(() => {
    setDetailsOpen(false);
    setHasRequestedSections(false);
    setLoading(false);
  }, [course.courseCode]);

  useEffect(() => {
    if (!autoLoadSections || hasRequestedSections || sections.length > 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void requestSectionsIfNeeded();
    }, preloadDelayMs);

    return () => window.clearTimeout(timeout);
  }, [autoLoadSections, hasRequestedSections, preloadDelayMs, sections.length]);

  async function requestSectionsIfNeeded(forceRetry = false) {
    if (loading || (!forceRetry && hasRequestedSections) || sections.length > 0) {
      return;
    }

    setHasRequestedSections(true);
    setLoading(true);
    try {
      await loadSectionsForCourse(course);
    } finally {
      setLoading(false);
    }
  }

  function handleToggleDetails() {
    const next = !detailsOpen;
    setDetailsOpen(next);
    if (next) {
      void requestSectionsIfNeeded();
    }
  }

  return (
    <article className="cp-course-card">
      <header>
        <div>
          <h4>{course.courseCode}</h4>
          <p>{course.name}</p>
        </div>
        <div className="cp-course-meta">
          <span>{formatCredits(course.minCredits, course.maxCredits)}</span>
          <button
            type="button"
            onClick={handleToggleDetails}
            aria-label="toggle sections"
            aria-expanded={detailsOpen}
          >
            {detailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </header>

      {detailsOpen && (
        <div className="cp-course-extra">
          {course.genEds.length > 0 && <p>GenEd: {course.genEds.join(", ")}</p>}
          {course.description && <p>{course.description}</p>}
        </div>
      )}

      <div className="cp-sections-list">
        {loading && (
          <div className="cp-inline-loading"><Loader2 size={14} className="spin" /> Loading sections</div>
        )}

        {!loading && visibleSections.map((section) => (
          <SectionRow key={`${course.courseCode}-${section.sectionCode}`} course={course} section={section} />
        ))}

        {!loading && hasRequestedSections && visibleSections.length === 0 && (
          <p className="cp-muted-text">
            No sections available. <button type="button" className="cp-inline-link" onClick={() => void requestSectionsIfNeeded(true)}>Retry</button>
          </p>
        )}
      </div>
    </article>
  );
}
