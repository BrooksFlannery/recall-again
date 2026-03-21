import { describe, test, expect } from "bun:test";
import { fibonacciIntervalDays } from "./spaced-repetition";

describe("fibonacciIntervalDays", () => {
  describe("early sequence", () => {
    test("step 0 → 1 day", () => {
      expect(fibonacciIntervalDays(0)).toBe(1);
    });

    test("step 1 → 1 day", () => {
      expect(fibonacciIntervalDays(1)).toBe(1);
    });

    test("step 2 → 2 days", () => {
      expect(fibonacciIntervalDays(2)).toBe(2);
    });

    test("step 3 → 3 days", () => {
      expect(fibonacciIntervalDays(3)).toBe(3);
    });

    test("step 4 → 5 days", () => {
      expect(fibonacciIntervalDays(4)).toBe(5);
    });

    test("step 5 → 8 days", () => {
      expect(fibonacciIntervalDays(5)).toBe(8);
    });
  });

  describe("cap", () => {
    test("step at max index returns last interval", () => {
      const atMax = fibonacciIntervalDays(11);
      const beyondMax = fibonacciIntervalDays(12);
      expect(beyondMax).toBe(atMax);
    });

    test("large step returns same last interval", () => {
      const atMax = fibonacciIntervalDays(11);
      expect(fibonacciIntervalDays(100)).toBe(atMax);
    });
  });
});
