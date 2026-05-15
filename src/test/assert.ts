export function equal<T>(actual: T, expected: T): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

export function deepEqual(actual: unknown, expected: unknown): void {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) {
    throw new Error(`Expected ${expectedText}, received ${actualText}`);
  }
}

export function throws(fn: () => unknown, pattern: RegExp): void {
  try {
    fn();
  } catch (error) {
    if (pattern.test(String((error as Error).message))) {
      return;
    }
    throw error;
  }
  throw new Error('Expected function to throw');
}
