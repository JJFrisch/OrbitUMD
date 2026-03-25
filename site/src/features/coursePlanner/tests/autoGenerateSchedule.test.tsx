import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AutoGenerateSchedulePage } from "../AutoGenerateSchedulePage";

const { searchCoursesWithStrategy, getSectionsForCourse } = vi.hoisted(() => ({
  searchCoursesWithStrategy: vi.fn(),
  getSectionsForCourse: vi.fn(),
}));

vi.mock("../services/courseSearchService", () => ({
  searchCoursesWithStrategy,
  getSectionsForCourse,
}));

describe("AutoGenerateSchedulePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    searchCoursesWithStrategy.mockImplementation(async ({ normalizedInput }: { normalizedInput: string }) => {
      const courses: Record<string, unknown> = {
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
          credits: 3,
          minCredits: 3,
          maxCredits: 3,
          genEds: [],
          term: "08",
          year: 2026,
        },
      };

      return courses[normalizedInput] ? [courses[normalizedInput]] : [];
    });

    getSectionsForCourse.mockImplementation(async (courseCode: string) => {
      if (courseCode === "CMSC131") {
        return [
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
        ];
      }

      if (courseCode === "MATH140") {
        return [
          {
            id: "MATH140-0101",
            courseCode: "MATH140",
            sectionCode: "0101",
            instructor: "Carol",
            instructors: ["Carol"],
            totalSeats: 30,
            openSeats: 10,
            meetings: [{ days: "TuTh", startTime: "10:00am", endTime: "11:15am", location: "ESJ 2204" }],
          },
        ];
      }

      if (courseCode === "ENGL101") {
        return [
          {
            id: "ENGL101-0101",
            courseCode: "ENGL101",
            sectionCode: "0101",
            instructor: "Dana",
            instructors: ["Dana"],
            totalSeats: 20,
            openSeats: 8,
            meetings: [{ days: "MWF", startTime: "9:30am", endTime: "10:20am", location: "TWS 1100" }],
          },
          {
            id: "ENGL101-0201",
            courseCode: "ENGL101",
            sectionCode: "0201",
            instructor: "Evan",
            instructors: ["Evan"],
            totalSeats: 20,
            openSeats: 7,
            meetings: [{ days: "TuTh", startTime: "12:00pm", endTime: "12:50pm", location: "TWS 1101" }],
          },
        ];
      }

      if (courseCode === "CHEM111") {
        return [
          {
            id: "CHEM111-0101",
            courseCode: "CHEM111",
            sectionCode: "0101",
            instructor: "Frank",
            instructors: ["Frank"],
            totalSeats: 24,
            openSeats: 12,
            meetings: [{ days: "MWF", startTime: "9:15am", endTime: "10:05am", location: "CHM 1202" }],
          },
        ];
      }

      return [];
    });
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <AutoGenerateSchedulePage />
      </MemoryRouter>
    );
  }

  it("generates schedules maximizing optional inclusion and supports seat display toggle", async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Required Courses"), {
      target: { value: "CMSC131 MATH140" },
    });
    fireEvent.change(screen.getByLabelText("Optional Courses"), {
      target: { value: "ENGL101" },
    });
    fireEvent.change(screen.getByLabelText("Min Credits"), {
      target: { value: "8" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Schedules" }));

    expect(await screen.findByText(/Generated Schedules \(1\)/)).toBeInTheDocument();
    expect(screen.getByText("Max optional fit: 1/1")).toBeInTheDocument();
    expect(screen.getByText("Option 1 of 1")).toBeInTheDocument();
    expect(screen.getByText("Classes: 3")).toBeInTheDocument();
    expect(screen.getByText("Earliest: 9:00 AM")).toBeInTheDocument();
    expect(screen.getByText("Latest: 12:50 PM")).toBeInTheDocument();
    expect(screen.getByTestId("generated-schedule-calendar")).toBeInTheDocument();
    expect(screen.queryAllByTestId("class-block-CMSC131::0101").length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId("class-block-CMSC131::0201").length).toBe(0);
    expect(screen.queryAllByTestId("class-block-ENGL101::0201").length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId("class-block-ENGL101::0101").length).toBe(0);

    fireEvent.click(screen.getByLabelText("Show seats (e.g. COMM107 30/50)"));
    expect(screen.getAllByText("CMSC131 6/30").length).toBeGreaterThan(0);
  });

  it("falls back to max feasible optional count and shows unfittable optional courses", async () => {
    getSectionsForCourse.mockImplementation(async (courseCode: string) => {
      if (courseCode === "CMSC131") {
        return [
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
        ];
      }

      if (courseCode === "MATH140") {
        return [
          {
            id: "MATH140-0101",
            courseCode: "MATH140",
            sectionCode: "0101",
            instructor: "Carol",
            instructors: ["Carol"],
            totalSeats: 30,
            openSeats: 10,
            meetings: [{ days: "TuTh", startTime: "10:00am", endTime: "11:15am", location: "ESJ 2204" }],
          },
        ];
      }

      if (courseCode === "ENGL101") {
        return [
          {
            id: "ENGL101-0101",
            courseCode: "ENGL101",
            sectionCode: "0101",
            instructor: "Dana",
            instructors: ["Dana"],
            totalSeats: 20,
            openSeats: 8,
            meetings: [{ days: "MWF", startTime: "9:30am", endTime: "10:20am", location: "TWS 1100" }],
          },
        ];
      }

      return [];
    });

    renderPage();

    fireEvent.change(screen.getByLabelText("Required Courses"), {
      target: { value: "CMSC131 MATH140" },
    });
    fireEvent.change(screen.getByLabelText("Optional Courses"), {
      target: { value: "ENGL101" },
    });
    fireEvent.change(screen.getByLabelText("Min Credits"), {
      target: { value: "8" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Schedules" }));

    expect(await screen.findByText(/Generated Schedules \(1\)/)).toBeInTheDocument();
    expect(screen.getByText("Max optional fit: 0/1")).toBeInTheDocument();
    expect(screen.getByText(/Could not fit these optional courses without conflicts: ENGL101/)).toBeInTheDocument();
    expect(screen.getByText("Classes: 2")).toBeInTheDocument();
  });

  it("respects time constraints on selected days", async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Required Courses"), {
      target: { value: "CMSC131" },
    });
    fireEvent.change(screen.getByLabelText("Start"), {
      target: { value: "10:00" },
    });
    fireEvent.change(screen.getByLabelText("End"), {
      target: { value: "17:00" },
    });

    fireEvent.click(screen.getByRole("button", { name: "M" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate Schedules" }));

    await waitFor(() => {
      expect(screen.getByText(/No valid sections remain for CMSC131 after applying criteria/)).toBeInTheDocument();
    });
  });

  it("shows no schedules when required courses cannot fit together", async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Required Courses"), {
      target: { value: "CMSC131 CHEM111" },
    });
    fireEvent.change(screen.getByLabelText("Min Credits"), {
      target: { value: "7" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Schedules" }));

    await waitFor(() => {
      expect(screen.getByText(/No conflict-free schedules found for required courses under current criteria/)).toBeInTheDocument();
    });
  });

  it("does not switch generated schedule on mostly vertical wheel scroll", async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Required Courses"), {
      target: { value: "CMSC131" },
    });
    fireEvent.change(screen.getByLabelText("Optional Courses"), {
      target: { value: "ENGL101" },
    });
    fireEvent.change(screen.getByLabelText("Min Credits"), {
      target: { value: "4" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Schedules" }));

    const generatedLabel = await screen.findByText(/Generated Schedules \(\d+\)/);
    expect(generatedLabel).toBeInTheDocument();

    const countMatch = generatedLabel.textContent?.match(/Generated Schedules \((\d+)\)/);
    const generatedCount = Number(countMatch?.[1] ?? 0);
    if (generatedCount <= 1) {
      return;
    }

    const scroller = screen.getByTestId("generated-schedule-calendar").closest(".cp-generate-result-list");
    expect(scroller).not.toBeNull();
    if (!scroller) return;

    expect(screen.getByText(new RegExp(`Option 1 of ${generatedCount}`))).toBeInTheDocument();

    fireEvent.wheel(scroller, { deltaX: 10, deltaY: 50 });

    expect(screen.getByText(new RegExp(`Option 1 of ${generatedCount}`))).toBeInTheDocument();
  });

  it("switches generated schedule on clearly horizontal wheel scroll", async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Required Courses"), {
      target: { value: "CMSC131" },
    });
    fireEvent.change(screen.getByLabelText("Optional Courses"), {
      target: { value: "ENGL101" },
    });
    fireEvent.change(screen.getByLabelText("Min Credits"), {
      target: { value: "4" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Schedules" }));

    const generatedLabel = await screen.findByText(/Generated Schedules \(\d+\)/);
    expect(generatedLabel).toBeInTheDocument();

    const countMatch = generatedLabel.textContent?.match(/Generated Schedules \((\d+)\)/);
    const generatedCount = Number(countMatch?.[1] ?? 0);
    if (generatedCount <= 1) {
      return;
    }

    const scroller = screen.getByTestId("generated-schedule-calendar").closest(".cp-generate-result-list");
    expect(scroller).not.toBeNull();
    if (!scroller) return;

    expect(screen.getByText(new RegExp(`Option 1 of ${generatedCount}`))).toBeInTheDocument();

    fireEvent.wheel(scroller, { deltaX: 120, deltaY: 20 });

    expect(await screen.findByText(new RegExp(`Option 2 of ${generatedCount}`))).toBeInTheDocument();
  });

  it("does not switch generated schedule on mostly vertical touch gesture", async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Required Courses"), {
      target: { value: "CMSC131" },
    });
    fireEvent.change(screen.getByLabelText("Optional Courses"), {
      target: { value: "ENGL101" },
    });
    fireEvent.change(screen.getByLabelText("Min Credits"), {
      target: { value: "4" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate Schedules" }));

    const generatedLabel = await screen.findByText(/Generated Schedules \(\d+\)/);
    expect(generatedLabel).toBeInTheDocument();

    const countMatch = generatedLabel.textContent?.match(/Generated Schedules \((\d+)\)/);
    const generatedCount = Number(countMatch?.[1] ?? 0);
    if (generatedCount <= 1) {
      return;
    }

    const scroller = screen.getByTestId("generated-schedule-calendar").closest(".cp-generate-result-list");
    expect(scroller).not.toBeNull();
    if (!scroller) return;

    expect(screen.getByText(new RegExp(`Option 1 of ${generatedCount}`))).toBeInTheDocument();

    fireEvent.touchStart(scroller, {
      touches: [{ clientX: 200, clientY: 100 }],
    });
    fireEvent.touchEnd(scroller, {
      changedTouches: [{ clientX: 150, clientY: 20 }],
    });

    expect(screen.getByText(new RegExp(`Option 1 of ${generatedCount}`))).toBeInTheDocument();
  });
});
