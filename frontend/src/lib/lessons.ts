// Learner-facing lesson completion — which katas *this reader* has finished.
//
// Distinct from `KatasProgress` (build/authoring status): this is per-learner state,
// toggled in the UI, persisted in IndexedDB (its own `lessons` store) so it works
// offline and can later sync to the SkillzEngine LMS. Records are keyed by kata id
// with a { completedAt } timestamp for last-write-wins merges.
//
// React reads it through `useCompletedLessons()` / `useLessonComplete(id)` (backed by
// useSyncExternalStore); imperative callers use the `Lessons` object, also exposed as
// `window.KatasLessons`.

import * as React from "react";
import { katas } from "./content";
import { createKvStore } from "./kv-store";
import { notifyCompletion } from "./skillzengine-bridge";

interface LessonRecord {
  completedAt: number;
}

const store = createKvStore("skillz-katas", "lessons");

// Immutable snapshot for useSyncExternalStore — its identity changes only on write.
let completed: ReadonlySet<string> = new Set<string>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

const ready: Promise<void> = store
  .getAll()
  .then((rows) => {
    completed = new Set(Object.keys(rows));
    emit();
  })
  .catch(() => {
    /* storage unavailable — start empty */
  });

function setComplete(id: string, done: boolean, silent = false): void {
  if (done === completed.has(id)) return;
  const next = new Set(completed);
  if (done) {
    next.add(id);
    void store.set(id, { completedAt: Date.now() } satisfies LessonRecord);
    if (!silent) {
      void notifyCompletion(id);
    }
  } else {
    next.delete(id);
    void store.remove(id);
  }
  completed = next;
  emit();
}

export const Lessons = {
  /** Resolves once persisted completion has hydrated from IndexedDB. */
  ready,
  /** Total number of lessons (katas). */
  total(): number {
    return katas.length;
  },
  count(): number {
    return completed.size;
  },
  percent(): number {
    return katas.length ? Math.round((completed.size / katas.length) * 100) : 0;
  },
  isComplete(id: string): boolean {
    return completed.has(id);
  },
  completedIds(): string[] {
    return [...completed];
  },
  complete(id: string, silent = false): void {
    setComplete(id, true, silent);
  },
  uncomplete(id: string, silent = false): void {
    setComplete(id, false, silent);
  },
  toggle(id: string, silent = false): void {
    setComplete(id, !completed.has(id), silent);
  },
  /** Clear all completion (this learner starts over). */
  reset(): void {
    if (completed.size === 0) return;
    completed = new Set();
    void store.clear();
    emit();
  },
  /** Subscribe to changes; returns an unsubscribe fn. */
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** Current snapshot (stable identity between writes) — for useSyncExternalStore. */
  snapshot(): ReadonlySet<string> {
    return completed;
  },
};

export type LessonsApi = typeof Lessons;

// ── React bindings ─────────────────────────────────────────────────────────
/** The reactive set of completed lesson ids. */
export function useCompletedLessons(): ReadonlySet<string> {
  return React.useSyncExternalStore(Lessons.subscribe, Lessons.snapshot, Lessons.snapshot);
}

/** Whether a specific lesson is complete (re-renders on change). */
export function useLessonComplete(id: string): boolean {
  return useCompletedLessons().has(id);
}

/** Reactive { count, total, percent } for progress indicators. */
export function useLessonsProgress(): { count: number; total: number; percent: number } {
  const set = useCompletedLessons();
  const total = katas.length;
  return { count: set.size, total, percent: total ? Math.round((set.size / total) * 100) : 0 };
}

// Expose for console / LMS bridge (browser only).
if (typeof window !== "undefined") {
  (window as unknown as { KatasLessons: LessonsApi }).KatasLessons = Lessons;
}
