import { fetchCourseRelationshipsFromUmdApi, searchCourses, fetchTerms } from "@/lib/api/umdCourses";

export interface CourseDetails {
  code: string;
  title: string;
  credits: number;
  genEds: string[];
  description?: string;
  prereqs?: string;
}

/**
 * Get the current or most recent term code (typically current semester)
 */
export async function getCurrentTermCode(): Promise<string> {
  try {
    const terms = await fetchTerms();
    if (terms.length > 0) {
      // Return the first (most recent/current) term
      return terms[0].code;
    }
  } catch {
    // Fall back to default if API not available
  }
  
  // Fallback: construct current term code (YYYYMM format)
  const now = new Date();
  const year = now.getFullYear();
  let month = now.getMonth() + 1;
  
  // Map month to UMD term code
  let termCode: string;
  if (month >= 9) {
    termCode = `${year}12`; // Fall
  } else if (month >= 6) {
    termCode = `${year}05`; // Summer
  } else {
    termCode = `${year}01`; // Spring
  }
  
  return termCode;
}

/**
 * Batch lookup course details by course codes
 * Caches results to avoid duplicate API calls
 */
export async function lookupCourseDetails(courseCodes: string[]): Promise<Map<string, CourseDetails>> {
  const result = new Map<string, CourseDetails>();
  const missingCodes = new Set<string>();

  // Normalize codes
  const normalizedCodes = Array.from(new Set(courseCodes.map((c) => c.toUpperCase())));

  try {
    const termCode = await getCurrentTermCode();
    const allTerms = await fetchTerms().catch(() => []);
    const termCandidates = [
      termCode,
      ...allTerms.map((term) => term.code).filter((code) => code !== termCode),
    ].slice(0, 8);

    // Search for each course
    for (const code of normalizedCodes) {
      try {
        const deptId = code.replace(/\d+/, "").toUpperCase();
        let matchedCourse: (Awaited<ReturnType<typeof searchCourses>>[number] | null) = null;
        let matchedTerm = termCode;

        for (const candidateTerm of termCandidates) {
          let courses = await searchCourses({
            termCode: candidateTerm,
            query: code,
            deptId,
          });

          // Some valid courses are excluded by strict dept filters in certain catalog sync states.
          // Retry without dept filter before declaring the course unavailable.
          if (courses.length === 0) {
            courses = await searchCourses({
              termCode: candidateTerm,
              query: code,
            });
          }

          if (courses.length > 0) {
            matchedCourse = courses.find((item) => item.id.toUpperCase() === code) ?? courses[0];
            matchedTerm = candidateTerm;
            break;
          }
        }

        if (matchedCourse) {
          const course = matchedCourse;
          const relationshipFallback = (!course.relationships?.prereqs || !course.description)
            ? await fetchCourseRelationshipsFromUmdApi(matchedTerm, code)
            : null;

          result.set(code, {
            code: course.id ?? code,
            title: course.title ?? `${code} - Unknown Course`,
            credits: course.credits ?? 0,
            genEds: course.genEdTags ?? [],
            description: course.description ?? relationshipFallback?.description,
            prereqs: course.relationships?.prereqs ?? relationshipFallback?.prereqs,
          });
        } else {
          let relationshipFallback: { prereqs?: string; description?: string } | null = null;
          for (const candidateTerm of termCandidates) {
            relationshipFallback = await fetchCourseRelationshipsFromUmdApi(candidateTerm, code).catch(() => null);
            if (relationshipFallback) break;
          }
          if (relationshipFallback) {
            result.set(code, {
              code,
              title: code,
              credits: 0,
              genEds: [],
              description: relationshipFallback.description,
              prereqs: relationshipFallback.prereqs,
            });
          } else {
            missingCodes.add(code);
          }
        }
      } catch {
        missingCodes.add(code);
      }
    }

    // Create placeholder entries for missing courses
    for (const code of missingCodes) {
      result.set(code, {
        code,
        title: `${code} (Course details unavailable)`,
        credits: 0,
        genEds: [],
      });
    }
  } catch {
    // Fall back: create placeholders for all codes if term lookup fails
    for (const code of normalizedCodes) {
      result.set(code, {
        code,
        title: `${code} (Details not loaded)`,
        credits: 0,
        genEds: [],
      });
    }
  }

  return result;
}
