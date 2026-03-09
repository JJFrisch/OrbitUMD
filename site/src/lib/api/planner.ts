import type { UmdCourseSummary } from "../types/course";
import { searchCourses } from "./umdCourses";
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
};
