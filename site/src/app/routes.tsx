import { createBrowserRouter } from "react-router";
import RootLayout from "./layouts/RootLayout";
import Welcome from "./pages/onboarding/Welcome";
import BasicProfile from "./pages/onboarding/BasicProfile";
import GoalSelection from "./pages/onboarding/GoalSelection";
import Dashboard from "./pages/Dashboard";
import GenerateSchedule from "./pages/GenerateSchedule";
import ScheduleBuilder from "./pages/ScheduleBuilder";
import FourYearPlan from "./pages/FourYearPlan";
import DegreeAudit from "./pages/DegreeAudit";
import GenEds from "./pages/GenEds";
import CreditImport from "./pages/CreditImport";
import DegreeRequirements from "./pages/DegreeRequirement";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Welcome /> },
      { path: "onboarding/profile", element: <BasicProfile /> },
      { path: "onboarding/goals", element: <GoalSelection /> },
      { path: "dashboard", element: <Dashboard /> },
      { path: "generate-schedule", element: <GenerateSchedule /> },
      { path: "schedule-builder", element: <ScheduleBuilder /> },
      { path: "build-my-week", element: <ScheduleBuilder /> }, // Redirect old route
      { path: "four-year-plan", element: <FourYearPlan /> },
      { path: "degree-audit", element: <DegreeAudit /> },
      { path: "gen-eds", element: <GenEds /> },
      { path: "credit-import", element: <CreditImport /> },
      { path: "degree-requirements", element: <DegreeRequirements /> },
      { path: "settings", element: <Settings /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);