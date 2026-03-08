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
} from "../repositories/userSchedulesRepository";

export const plannerApi = {
  listUserSchedules,
  upsertUserSchedule,
  deleteUserSchedule,
  listSectionsForSchedule,
  replaceScheduleSections,
  listFourYearPlans,
  createFourYearPlan,
  deleteFourYearPlan,
  upsertPlanTerm,
  replacePlanTermCourses,
  async searchCourses(query: string, termCode: string, genEdTag?: string): Promise<UmdCourseSummary[]> {
    return searchCourses({ termCode, query, genEdTag, page: 1, pageSize: 30 });
  },
};
