import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useState } from "react";
import { SectionRow } from "./SectionRow";
import { useCoursePlannerStore } from "../../state/coursePlannerStore";
import type { Course } from "../../types/coursePlanner";

interface CourseCardProps {
  course: Course;
}

export function CourseCard({ course }: CourseCardProps) {
  const [expanded, setExpanded] = useState(false);
  const loadSectionsForCourse = useCoursePlannerStore((state) => state.loadSectionsForCourse);
  const filters = useCoursePlannerStore((state) => state.filters);
  const [loading, setLoading] = useState(false);

  const sections = course.sections ?? [];
  const visibleSections = filters.onlyOpen ? sections.filter((section) => section.openSeats > 0) : sections;

  async function toggleExpand() {
    const next = !expanded;
    setExpanded(next);

    if (next && sections.length === 0) {
      setLoading(true);
      try {
        await loadSectionsForCourse(course);
      } finally {
        setLoading(false);
      }
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
          <span>{course.credits} cr</span>
          <button type="button" onClick={toggleExpand} aria-label="toggle sections">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </header>

      {expanded && (
        <div className="cp-sections-list">
          {loading && (
            <div className="cp-inline-loading"><Loader2 size={14} className="spin" /> Loading sections</div>
          )}

          {!loading && visibleSections.map((section) => (
            <SectionRow key={`${course.courseCode}-${section.sectionCode}`} course={course} section={section} />
          ))}

          {!loading && visibleSections.length === 0 && (
            <p className="cp-muted-text">No sections available.</p>
          )}
        </div>
      )}
    </article>
  );
}
