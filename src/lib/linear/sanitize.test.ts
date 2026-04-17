import { describe, it, expect } from "vitest";
import { sanitizeDueDate, sanitizePriority } from "./sanitize";

describe("sanitizeDueDate", () => {
  it("returns undefined for null", () => {
    expect(sanitizeDueDate(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(sanitizeDueDate(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(sanitizeDueDate("")).toBeUndefined();
  });

  it("accepts valid YYYY-MM-DD", () => {
    expect(sanitizeDueDate("2026-04-20")).toBe("2026-04-20");
  });

  it("trims whitespace around valid date", () => {
    expect(sanitizeDueDate("  2026-04-20  ")).toBe("2026-04-20");
  });

  it("rejects natural language dates", () => {
    expect(sanitizeDueDate("다음주 금요일")).toBeUndefined();
    expect(sanitizeDueDate("next Friday")).toBeUndefined();
    expect(sanitizeDueDate("tomorrow")).toBeUndefined();
  });

  it("rejects wrong-format dates", () => {
    expect(sanitizeDueDate("2026/04/20")).toBeUndefined();
    expect(sanitizeDueDate("20-04-2026")).toBeUndefined();
    expect(sanitizeDueDate("2026-4-20")).toBeUndefined(); // no zero-pad
    expect(sanitizeDueDate("2026-04-20T00:00:00Z")).toBeUndefined();
  });
});

describe("sanitizePriority", () => {
  it("returns undefined for null", () => {
    expect(sanitizePriority(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(sanitizePriority(undefined)).toBeUndefined();
  });

  it("accepts 0-4 integers", () => {
    expect(sanitizePriority(0)).toBe(0);
    expect(sanitizePriority(1)).toBe(1);
    expect(sanitizePriority(2)).toBe(2);
    expect(sanitizePriority(3)).toBe(3);
    expect(sanitizePriority(4)).toBe(4);
  });

  it("rejects out-of-range integers", () => {
    expect(sanitizePriority(-1)).toBeUndefined();
    expect(sanitizePriority(5)).toBeUndefined();
    expect(sanitizePriority(100)).toBeUndefined();
  });

  it("rejects non-integers", () => {
    expect(sanitizePriority(2.5)).toBeUndefined();
    expect(sanitizePriority(0.1)).toBeUndefined();
  });

  it("rejects NaN", () => {
    expect(sanitizePriority(NaN)).toBeUndefined();
  });
});
