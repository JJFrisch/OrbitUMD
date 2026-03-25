import { describe, expect, it } from "vitest";
import { assignConflictIndexes, buildCalendarMeetings, computeVisibleHourBounds, getBlockGeometry } from "../utils/scheduleLayout";

describe("schedule layout", () => {
  it("assigns conflict indexes for overlap", () => {
    const meetings = assignConflictIndexes([
      {
        id: "a",
        sectionKey: "A",
        courseCode: "CMSC131",
        sectionCode: "0101",
        title: "x",
        instructor: "y",
        day: "M",
        startHour: 10,
        endHour: 11,
        conflictIndex: 0,
        conflictTotal: 1,
      },
      {
        id: "b",
        sectionKey: "B",
        courseCode: "MATH141",
        sectionCode: "0101",
        title: "x",
        instructor: "y",
        day: "M",
        startHour: 10.5,
        endHour: 11.5,
        conflictIndex: 0,
        conflictTotal: 1,
      },
    ]);

    const monday = meetings.filter((meeting) => meeting.day === "M");
    expect(monday[0].conflictTotal).toBeGreaterThan(1);
    expect(monday[1].conflictTotal).toBeGreaterThan(1);
  });

  it("computes default and print bounds", () => {
    expect(computeVisibleHourBounds([])).toEqual({ startHour: 8, endHour: 16 });
    expect(computeVisibleHourBounds([], { printMode: true })).toEqual({ startHour: 9, endHour: 21 });
  });

  it("computes block geometry percentages", () => {
    const geometry = getBlockGeometry(
      {
        id: "x",
        sectionKey: "S",
        courseCode: "CMSC131",
        sectionCode: "0101",
        title: "x",
        instructor: "x",
        day: "Tu",
        startHour: 9,
        endHour: 10,
        conflictIndex: 0,
        conflictTotal: 2,
      },
      { startHour: 8, endHour: 16 }
    );

    expect(geometry.topPct).toBeCloseTo(12.5);
    expect(geometry.widthPct).toBe(50);
  });

  it("aligns minute-offset meetings to exact percentage positions", () => {
    const geometry = getBlockGeometry(
      {
        id: "minute-offset",
        sectionKey: "S",
        courseCode: "CMSC131",
        sectionCode: "0101",
        title: "x",
        instructor: "x",
        day: "Tu",
        startHour: 9.25,
        endHour: 10.75,
        conflictIndex: 0,
        conflictTotal: 1,
      },
      { startHour: 8, endHour: 16 }
    );

    expect(geometry.topPct).toBeCloseTo(15.625);
    expect(geometry.heightPct).toBeCloseTo(18.75);
  });

  it("clamps meetings outside visible bounds", () => {
    const geometry = getBlockGeometry(
      {
        id: "out-of-range",
        sectionKey: "S",
        courseCode: "CMSC131",
        sectionCode: "0101",
        title: "x",
        instructor: "x",
        day: "M",
        startHour: 6,
        endHour: 18,
        conflictIndex: 0,
        conflictTotal: 1,
      },
      { startHour: 8, endHour: 16 }
    );

    expect(geometry.topPct).toBe(0);
    expect(geometry.heightPct).toBe(100);
  });

  it("maps untimed meetings to Other", () => {
    const blocks = buildCalendarMeetings({
      sectionKey: "S",
      courseCode: "CMSC131",
      sectionCode: "0101",
      title: "CMSC131",
      instructor: "Staff",
      meetings: [{ days: "TBA" }],
    });

    expect(blocks[0].day).toBe("Other");
  });
});
