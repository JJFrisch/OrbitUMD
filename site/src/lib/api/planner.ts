import type { UmdCourseSummary } from "../types/course";
import { fetchTerms, searchCourses } from "./umdCourses";
import {
  deleteFourYearPlan,
  listFourYearPlans,
  replacePlanTermCourses,
  upsertPlanTerm,
  createFourYearPlan,
} from "../repositories/fourYearPlansRepository";
import {
  deleteUserSchedule,
  listSectionsForSchedule,
  listUserSchedules,
  replaceScheduleSections,
  upsertUserSchedule,
  saveScheduleWithSelections,
  listSchedulesForTerm,
  loadScheduleById,
  listAllSchedulesWithSelections,
} from "../repositories/userSchedulesRepository";
import {
  fetchProgramRequirements,
  saveProgramRequirements,
  deleteSection as deleteDegreeSection,
} from "../repositories/degreeRequirementsRepository";

export const plannerApi = {
  // Schedules
  listUserSchedules,
  upsertUserSchedule,
  deleteUserSchedule,
  listSectionsForSchedule,
  replaceScheduleSections,
  saveScheduleWithSelections,
  listSchedulesForTerm,
  loadScheduleById,
  listAllSchedulesWithSelections,
  // Four-year plans
  listFourYearPlans,
  createFourYearPlan,
  deleteFourYearPlan,
  upsertPlanTerm,
  replacePlanTermCourses,
  // Degree requirements
  fetchProgramRequirements,
  saveProgramRequirements,
  deleteDegreeSection,
  // Course search
  async searchCourses(query: string, termCode: string, genEdTag?: string): Promise<UmdCourseSummary[]> {
    return searchCourses({ termCode, query, genEdTag, page: 1, pageSize: 30 });
  },

  async searchCoursesAcrossRecentTerms(
    query: string,
    genEdTag?: string,
    maxTerms: number = 8,
  ): Promise<UmdCourseSummary[]> {
    const terms = await fetchTerms();
    const newestFirst = [...terms].sort((a, b) => b.code.localeCompare(a.code));
    const selectedTerms = newestFirst.slice(0, Math.max(1, maxTerms));

    const perTermResults = await Promise.all(
      selectedTerms.map((term) =>
        searchCourses({ termCode: term.code, query, genEdTag, page: 1, pageSize: 30 })
          .catch(() => [] as UmdCourseSummary[]),
      ),
    );

    const deduped = new Map<string, UmdCourseSummary>();
    for (const termRows of perTermResults) {
      for (const course of termRows) {
        const key = String(course.id ?? "").toUpperCase();
        if (!key || deduped.has(key)) continue;
        deduped.set(key, course);
      }
    }

    return Array.from(deduped.values());
  },
};
