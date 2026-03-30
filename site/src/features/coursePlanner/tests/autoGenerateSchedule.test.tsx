import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { AutoGenerateSchedulePage } from "../AutoGenerateSchedulePage";
import { useCoursePlannerStore } from "../state/coursePlannerStore";

const { searchCoursesWithStrategy, getSectionsForCourse, fetchTerms, saveScheduleWithSelections } = vi.hoisted(() => ({
  searchCoursesWithStrategy: vi.fn(),
  getSectionsForCourse: vi.fn(),
  fetchTerms: vi.fn(),
  saveScheduleWithSelections: vi.fn(),
}));

vi.mock("../services/courseSearchService", () => ({
  searchCoursesWithStrategy,
  getSectionsForCourse,
}));

vi.mock("@/lib/api/umdCourses", () => ({
  fetchTerms,
}));

vi.mock("@/lib/repositories/userSchedulesRepository", () => ({
  saveScheduleWithSelections,
}));

const COURSE_DATA: Record<string, any> = {
  CMSC131: {
    id: "CMSC131-202608",
    courseCode: "CMSC131",
    name: "Object-Oriented Programming I",
    deptId: "CMSC",
    credits: 4,
    minCredits: 4,
    maxCredits: 4,
    genEds: [],
    term: "08",
    year: 2026,
  },
  MATH140: {
    id: "MATH140-202608",
    courseCode: "MATH140",
    name: "Calculus I",
    deptId: "MATH",
    credits: 4,
    minCredits: 4,
    maxCredits: 4,
    genEds: [],
    term: "08",
    year: 2026,
  },
  ENGL101: {
    id: "ENGL101-202608",
    courseCode: "ENGL101",
    name: "Academic Writing",
    deptId: "ENGL",
    credits: 4,
    minCredits: 4,
    maxCredits: 4,
    genEds: [],
    term: "08",
    year: 2026,
  },
  CHEM111: {
    id: "CHEM111-202608",
    courseCode: "CHEM111",
    name: "General Chemistry I",
    deptId: "CHEM",
    credits: 4,
    minCredits: 4,
    maxCredits: 4,
    genEds: [],
    term: "08",
    year: 2026,
  },
  PHYS161: {
    id: "PHYS161-202608",
    courseCode: "PHYS161",
    name: "General Physics: Mechanics",
    deptId: "PHYS",
    credits: 3,
    minCredits: 3,
    maxCredits: 3,
    genEds: [],
    term: "08",
    year: 2026,
  },
};

function defaultSearchMock({ normalizedInput }: { normalizedInput: string }) {
  const needle = String(normalizedInput || "").toUpperCase();
  if (!needle) {
    return Promise.resolve([]);
  }

  const values = Object.values(COURSE_DATA).filter((course) => (
    course.courseCode.includes(needle) || course.name.toUpperCase().includes(needle)
  ));

  return Promise.resolve(values);
}

function defaultSectionsMock(courseCode: string) {
  if (courseCode === "CMSC131") {
    return Promise.resolve([
      {
        id: "CMSC131-0201",
        courseCode: "CMSC131",
        sectionCode: "0201",
        instructor: "Bob",
        instructors: ["Bob"],
        totalSeats: 30,
        openSeats: 0,
        meetings: [{ days: "MWF", startTime: "9:00am", endTime: "9:50am", location: "IRB 0324" }],
      },
      {
        id: "CMSC131-0101",
        courseCode: "CMSC131",
        sectionCode: "0101",
        instructor: "Alice",
        instructors: ["Alice"],
        totalSeats: 30,
        openSeats: 6,
        meetings: [{ days: "MWF", startTime: "9:00am", endTime: "9:50am", location: "IRB 0324" }],
      },
    ]);
  }

  if (courseCode === "MATH140") {
    return Promise.resolve([
      {
        id: "MATH140-0101",
        courseCode: "MATH140",
        sectionCode: "0101",
        instructor: "Carol",
        instructors: ["Carol"],
        totalSeats: 35,
        openSeats: 10,
        meetings: [{ days: "TuTh", startTime: "10:00am", endTime: "11:15am", location: "ESJ 2204" }],
      },
    ]);
  }

  if (courseCode === "ENGL101") {
    return Promise.resolve([
      {
        id: "ENGL101-0101",
        courseCode: "ENGL101",
        sectionCode: "0101",
        instructor: "Dana",
        instructors: ["Dana"],
        totalSeats: 20,
        openSeats: 8,
        meetings: [{ days: "TuTh", startTime: "12:30pm", endTime: "1:45pm", location: "TWS 1100" }],
      },
    ]);
  }

  if (courseCode === "CHEM111") {
    return Promise.resolve([
      {
        id: "CHEM111-0101",
        courseCode: "CHEM111",
        sectionCode: "0101",
        instructor: "Frank",
        instructors: ["Frank"],
        totalSeats: 24,
        openSeats: 12,
        meetings: [{ days: "TuTh", startTime: "12:30pm", endTime: "1:45pm", location: "CHM 1202" }],
      },
    ]);
  }

  if (courseCode === "PHYS161") {
    return Promise.resolve([
      {
        id: "PHYS161-0101",
        courseCode: "PHYS161",
        sectionCode: "0101",
        instructor: "Erin",
        instructors: ["Erin"],
        totalSeats: 40,
        openSeats: 20,
        meetings: [{ days: "MWF", startTime: "9:15am", endTime: "10:05am", location: "PHY 1201" }],
      },
    ]);
  }

  return Promise.resolve([]);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AutoGenerateSchedulePage />
    </MemoryRouter>
  );
}

function renderPageWithLocationProbe() {
  function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location-probe">{location.pathname}{location.search}</div>;
  }

  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AutoGenerateSchedulePage />
      <LocationProbe />
    </MemoryRouter>
  );
}

async function openAddCoursePanel() {
  if (!screen.queryByLabelText("Search courses to add")) {
    fireEvent.click(screen.getByRole("button", { name: "Add a course" }));
  }

  await screen.findByLabelText("Search courses to add");
}

async function addCourse(code: string, kind: "required" | "optional" = "required") {
  await openAddCoursePanel();

  fireEvent.change(screen.getByLabelText("Add as"), {
    target: { value: kind },
  });

  fireEvent.change(screen.getByLabelText("Search courses to add"), {
    target: { value: code },
  });

  const option = await screen.findByRole("button", { name: new RegExp(code, "i") });
  fireEvent.click(option);
}

function setCreditRange(minValue: string, maxValue: string) {
  fireEvent.change(screen.getByLabelText("Minimum credits"), { target: { value: minValue } });
  fireEvent.change(screen.getByLabelText("Maximum credits"), { target: { value: maxValue } });
}

describe("AutoGenerateSchedulePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useCoursePlannerStore.setState({
      term: "08",
      year: 2026,
      resolvedTerm: "08",
      resolvedYear: 2026,
      selections: {},
      hoveredSelection: null,
      selectedInfoKey: null,
    });

    fetchTerms.mockResolvedValue([
      { code: "202612", season: "winter", year: 2026, label: "Winter 2026" },
      { code: "202701", season: "spring", year: 2027, label: "Spring 2027" },
      { code: "202708", season: "fall", year: 2027, label: "Fall 2027" },
      { code: "202608", season: "fall", year: 2026, label: "Fall 2026" },
    ]);

    searchCoursesWithStrategy.mockImplementation(defaultSearchMock);
    getSectionsForCourse.mockImplementation(defaultSectionsMock);
    saveScheduleWithSelections.mockResolvedValue({ id: "saved-1" });
  });

  it("changes term and generates schedules with rendered cards", async () => {
    renderPage();

    await addCourse("CMSC131", "required");
    setCreditRange("4", "8");

    fireEvent.click(screen.getByRole("button", { name: "Summer" }));
    fireEvent.change(screen.getByLabelText("Academic year"), { target: { value: "2027" } });

    fireEvent.click(screen.getByRole("button", { name: "Generate Schedules" }));

    expect(await screen.findByTestId("generated-card-1")).toBeInTheDocument();
    expect(screen.getByText(/conflict-free options for Summer 2027/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(getSectionsForCourse).toHaveBeenCalledWith("CMSC131", "05", 2027);
    });
  });

  it("keeps selected season even when a fall autosave draft exists", async () => {
    localStorage.setItem(
      "orbitumd:generate-schedule:draft:v2",
      JSON.stringify({
        savedAt: Date.now(),
        draft: {
          season: "08",
          year: 2026,
          coursePreferences: [],
          minCredits: 12,
          maxCredits: 20,
          onlyOpen: true,
          allowFaceToFace: true,
          allowBlended: true,
          allowOnline: true,
          constraintStart: "08:00",
          constraintEnd: "18:00",
          excludedDays: [],
        },
      })
    );

    renderPage();

    const summerButton = await screen.findByRole("button", { name: "Summer" });
    fireEvent.click(summerButton);

    await waitFor(() => {
      expect(summerButton).toHaveClass("is-active");
    });

    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(summerButton).toHaveClass("is-active");
  });

  it("uses course priority ordering when optional courses conflict", async () => {
    renderPage();

    await addCourse("CMSC131", "required");
    await addCourse("ENGL101", "optional");
    await addCourse("CHEM111", "optional");

    setCreditRange("4", "8");

    fireEvent.click(screen.getByRole("button", { name: "Generate Schedules" }));

    const initialCard = await screen.findByTestId("generated-card-1");
    expect(within(initialCard).getByText("ENGL101")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Move CHEM111 up" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate Schedules" }));

    await waitFor(() => {
      const updatedCard = screen.getByTestId("generated-card-1");
      expect(within(updatedCard).getByText("CHEM111")).toBeInTheDocument();
      expect(within(updatedCard).queryByText("ENGL101")).not.toBeInTheDocument();
    });
  });

  it("applies credit, modality, open-only, and time/day constraints", async () => {
    renderPage();

    await addCourse("CMSC131", "required");

    setCreditRange("4", "4");
    fireEvent.click(screen.getByRole("button", { name: "Generate Schedules" }));

    await screen.findByTestId("generated-card-1");
    expect(screen.queryAllByTestId("class-block-CMSC131::0101").length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId("class-block-CMSC131::0201").length).toBe(0);

    fireEvent.click(screen.getByRole("checkbox", { name: "Open sections only" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate Schedules" }));

    await waitFor(() => {
      expect(screen.queryAllByTestId("class-block-CMSC131::0201").length).toBeGreaterThan(0);
    });
    expect(screen.getByText(/2 conflict-free options/i)).toBeInTheDocument();
    expect(screen.getByTestId("generated-card-2")).toBeInTheDocument();

    const topCard = screen.getByTestId("generated-card-1");
    expect(within(topCard).getByText(/Classes: 1/i)).toBeInTheDocument();
    expect(within(topCard).getByText(/Earliest:/i)).toBeInTheDocument();
    expect(within(topCard).getByText(/Latest:/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "In-person" }));
    fireEvent.click(screen.getByRole("button", { name: "Blended" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate Schedules" }));

    expect(await screen.findByTestId("generate-error-state")).toHaveTextContent(/No valid sections remain/i);

    fireEvent.click(screen.getByRole("button", { name: "In-person" }));
    fireEvent.change(screen.getByLabelText("Earliest start"), { target: { value: "10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate Schedules" }));

    expect(await screen.findByTestId("generate-error-state")).toHaveTextContent(/No valid sections remain/i);

    fireEvent.change(screen.getByLabelText("Earliest start"), { target: { value: "08:00" } });
    fireEvent.click(screen.getByRole("button", { name: "M" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate Schedules" }));

    expect(await screen.findByTestId("generate-error-state")).toHaveTextContent(/No valid sections remain/i);
  });

  it("shows no-results message when required courses cannot fit together", async () => {
    renderPage();

    await addCourse("CMSC131", "required");
    await addCourse("PHYS161", "required");

    setCreditRange("7", "10");

    fireEvent.click(screen.getByRole("button", { name: "Generate Schedules" }));

    expect(await screen.findByTestId("generate-error-state")).toHaveTextContent(
      /No conflict-free schedules found for required courses under current criteria/i
    );
  });

  it("shows API failure error state", async () => {
    renderPage();

    await addCourse("CMSC131", "required");
    setCreditRange("4", "8");

    searchCoursesWithStrategy.mockRejectedValueOnce(new Error("Catalog unavailable"));

    fireEvent.click(screen.getByRole("button", { name: "Generate Schedules" }));

    expect(await screen.findByTestId("generate-error-state")).toHaveTextContent("Catalog unavailable");
  });

  it("saves, sets main, and opens generated schedules", async () => {
    renderPageWithLocationProbe();

    await addCourse("CMSC131", "required");
    setCreditRange("4", "8");

    fireEvent.click(screen.getByRole("button", { name: "Fall" }));
    fireEvent.change(screen.getByLabelText("Academic year"), { target: { value: "2026" } });

    fireEvent.click(screen.getByRole("button", { name: "Generate Schedules" }));

    const firstCard = await screen.findByTestId("generated-card-1");

    fireEvent.click(within(firstCard).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(saveScheduleWithSelections).toHaveBeenCalledWith(expect.objectContaining({
        name: "Generated Fall 2026 Option 1",
        termCode: "08",
        termYear: 2026,
        isPrimary: false,
      }));
    });

    fireEvent.click(within(firstCard).getByRole("button", { name: "Set as Main" }));
    await waitFor(() => {
      expect(saveScheduleWithSelections).toHaveBeenCalledWith(expect.objectContaining({
        name: "Generated Fall 2026 Option 1",
        termCode: "08",
        termYear: 2026,
        isPrimary: true,
      }));
    });

    fireEvent.click(within(firstCard).getByRole("button", { name: "Open" }));
    await waitFor(() => {
      expect(screen.getByTestId("location-probe").textContent).toContain("/schedule-builder?term=08-2026&generated=1&generatedIndex=1");
    });
  });
});
