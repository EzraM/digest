import { useCallback, useEffect, useRef } from "react";
import { Subject } from "rxjs";
import { debounceTime, distinctUntilChanged } from "rxjs/operators";

/**
 * Custom hook that provides debounced callback functionality using RxJS
 * RxJS complexity is contained here - consumers get a clean callback API
 *
 * @param callback - Function to call after debounce delay
 * @param delay - Debounce delay in milliseconds (default: 1000)
 * @param equalityFn - Optional function to compare values (default: JSON.stringify comparison)
 * @returns Debounced callback function
 */
export function useDebounced<T>(
  callback: (value: T) => void,
  delay = 1000,
  equalityFn?: (prev: T, current: T) => boolean
) {
  const callbackRef = useRef(callback);
  const subjectRef = useRef<Subject<T>>();

  // Keep callback reference fresh
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Initialize RxJS stream on first render
  useEffect(() => {
    const subject = new Subject<T>();
    subjectRef.current = subject;

    // Set up the debounced stream
    const subscription = subject
      .pipe(
        // Use custom equality function or default to JSON comparison
        distinctUntilChanged(
          equalityFn ||
            ((prev, current) =>
              JSON.stringify(prev) === JSON.stringify(current))
        ),
        debounceTime(delay)
      )
      .subscribe((value) => {
        callbackRef.current(value);
      });

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe();
      subject.complete();
    };
  }, [delay, equalityFn]);

  // Return the debounced callback function
  const debouncedCallback = useCallback((value: T) => {
    subjectRef.current?.next(value);
  }, []);

  return debouncedCallback;
}

/**
 * Simpler version for cases where you just want to debounce a parameterless function
 */
export function useDebouncedCallback(callback: () => void, delay = 1000) {
  const debouncedFn = useDebounced<void>(
    () => callback(),
    delay,
    () => true // Always treat as equal since no parameters
  );

  return useCallback(() => debouncedFn(undefined), [debouncedFn]);
}
