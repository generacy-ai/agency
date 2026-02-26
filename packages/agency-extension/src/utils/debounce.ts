import type * as vscode from 'vscode';
import { toDisposable } from './disposable';

/**
 * Creates a debounced version of a function.
 * The function will only execute after the specified delay has passed
 * since the last invocation.
 *
 * @param fn The function to debounce
 * @param delay The delay in milliseconds
 * @returns A debounced function with a cancel method
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const debounced = ((...args: Parameters<T>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
    }, delay);
  }) as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced;
}

/**
 * Creates a throttled version of a function.
 * The function will execute at most once per specified interval.
 *
 * @param fn The function to throttle
 * @param interval The minimum interval between calls in milliseconds
 * @returns A throttled function with a cancel method
 */
export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  interval: number
): T & { cancel: () => void } {
  let lastExecution = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Parameters<T> | null = null;

  const throttled = ((...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = interval - (now - lastExecution);

    if (remaining <= 0) {
      // Execute immediately
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastExecution = now;
      fn(...args);
    } else {
      // Schedule for later
      pendingArgs = args;
      if (timeoutId === null) {
        timeoutId = setTimeout(() => {
          timeoutId = null;
          lastExecution = Date.now();
          if (pendingArgs !== null) {
            fn(...pendingArgs);
            pendingArgs = null;
          }
        }, remaining);
      }
    }
  }) as T & { cancel: () => void };

  throttled.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    pendingArgs = null;
  };

  return throttled;
}

/**
 * Creates a debounced function that returns a disposable.
 * Useful for VS Code event handlers that need cleanup.
 *
 * @param fn The function to debounce
 * @param delay The delay in milliseconds
 * @returns A tuple of [debounced function, disposable for cleanup]
 */
export function createDebouncedDisposable<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): [T, vscode.Disposable] {
  const debounced = debounce(fn, delay);
  const disposable = toDisposable(() => debounced.cancel());
  return [debounced as T, disposable];
}

/**
 * Creates a throttled function that returns a disposable.
 * Useful for VS Code event handlers that need cleanup.
 *
 * @param fn The function to throttle
 * @param interval The minimum interval between calls in milliseconds
 * @returns A tuple of [throttled function, disposable for cleanup]
 */
export function createThrottledDisposable<T extends (...args: unknown[]) => void>(
  fn: T,
  interval: number
): [T, vscode.Disposable] {
  const throttled = throttle(fn, interval);
  const disposable = toDisposable(() => throttled.cancel());
  return [throttled as T, disposable];
}

/**
 * Delays execution for a specified amount of time.
 * Returns a promise that resolves after the delay.
 *
 * @param ms The delay in milliseconds
 * @returns A promise that resolves after the delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates a delay that can be cancelled.
 * Returns both the promise and a cancel function.
 *
 * @param ms The delay in milliseconds
 * @returns An object with promise and cancel function
 */
export function cancellableDelay(ms: number): { promise: Promise<void>; cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let _rejectFn: (() => void) | null = null;

  const promise = new Promise<void>((resolve, reject) => {
    _rejectFn = reject;
    timeoutId = setTimeout(resolve, ms);
  });

  const cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return { promise, cancel };
}

/**
 * Creates a leading-edge debounced function.
 * The function executes immediately on the first call,
 * then ignores subsequent calls until the delay has passed.
 *
 * @param fn The function to debounce
 * @param delay The delay in milliseconds
 * @returns A leading-edge debounced function with a cancel method
 */
export function debounceLeading<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let canExecute = true;

  const debounced = ((...args: Parameters<T>) => {
    if (canExecute) {
      canExecute = false;
      fn(...args);
    }

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      canExecute = true;
      timeoutId = null;
    }, delay);
  }) as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    canExecute = true;
  };

  return debounced;
}
