"use client";

import { useCallback, useRef } from "react";

/** Debounce a save callback so edits persist without a round-trip per keystroke. */
export function useDebouncedSave<T>(onSave: (value: T) => void, delay = 800) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    (value: T) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => onSave(value), delay);
    },
    [onSave, delay],
  );
}
