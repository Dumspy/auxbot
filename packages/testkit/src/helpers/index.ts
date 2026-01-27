export async function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(() => resolve());
  });
}

export function waitFor<T>(
  condition: () => T | undefined,
  options: { timeout?: number; interval?: number } = {}
): Promise<T> {
  const { timeout = 5000, interval = 100 } = options;
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      try {
        const result = condition();
        if (result !== undefined) {
          resolve(result);
        } else if (Date.now() - startTime > timeout) {
          reject(new Error(`Condition not met within ${timeout}ms`));
        } else {
          setTimeout(check, interval);
        }
      } catch (error) {
        reject(error);
      }
    };
    check();
  });
}
