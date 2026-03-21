const FIBONACCI = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144];

/** Days until next review for the n-th successful review (0-based step). */
export const fibonacciIntervalDays = (stepIndex: number): number => {
  const index = Math.max(0, Math.min(stepIndex, FIBONACCI.length - 1));
  return FIBONACCI[index]!;
};
