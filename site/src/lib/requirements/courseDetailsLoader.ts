import { searchCourses, fetchTerms } from "@/lib/api/umdCourses";

export interface CourseDetails {
  code: string;
  title: string;
  credits: number;
  genEds: string[];
  description?: string;
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

    // Search for each course
    for (const code of normalizedCodes) {
      try {
        const courses = await searchCourses({
          termCode,
          query: code,
          deptId: code.replace(/\d+/, "").toUpperCase(),
        });

        if (courses.length > 0) {
          const course = courses[0];
          result.set(code, {
            code: course.id ?? code,
            title: course.title ?? `${code} - Unknown Course`,
            credits: course.credits ?? 0,
            genEds: course.genEds ?? [],
            description: course.description,
          });
        } else {
          missingCodes.add(code);
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
