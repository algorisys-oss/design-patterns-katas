// Project completion status + a small query/mutate API over it.
//
// Milestones are curated here; the 28 kata items are derived from the built content
// (every kata that exists is "completed", so this can't drift from reality). A mutable
// overrides layer (persisted to localStorage) lets callers mark items — e.g. flip
// `static-deploy` to completed once the site is published — without editing this file.
//
// Overrides persist in IndexedDB (via the Kv store), so a learner's marks survive
// offline and the same store can later sync to the SkillzEngine LMS. Reads stay
// synchronous against an in-memory overlay that's hydrated from IndexedDB on load;
// await `Progress.ready` if you need the persisted marks applied first.
//
// The API is exported for import *and* attached to `window.KatasProgress` (see the
// bottom) so it's reachable from the devtools console or any external script:
//
//   await KatasProgress.ready                  // wait for persisted marks to hydrate
//   KatasProgress.summary()                    // { total, completed, inProgress, todo, percent }
//   KatasProgress.byStatus("todo")             // remaining work
//   KatasProgress.isCompleted("rich-uml")      // true
//   KatasProgress.markCompleted("static-deploy")
//   KatasProgress.reset()                       // clear local overrides

import { katas } from "./content";
import { createKvStore } from "./kv-store";

export type ProgressStatus = "completed" | "in-progress" | "todo";

export interface ProgressItem {
  id: string;
  title: string;
  group: "milestone" | "foundations" | "creational" | "structural" | "behavioral";
  status: ProgressStatus;
  note?: string;
}

export interface ProgressSummary {
  total: number;
  completed: number;
  inProgress: number;
  todo: number;
  /** Percent of items completed, 0–100 (rounded). */
  percent: number;
}

// ── Milestones (source of truth, curated) ──────────────────────────────────
const MILESTONES: readonly ProgressItem[] = [
  { id: "scaffold", title: "Scaffold repo (content, backend, frontend, docs)", group: "milestone", status: "completed" },
  { id: "kata-schema", title: "Lock kata schema + template", group: "milestone", status: "completed" },
  { id: "exemplar-strategy", title: "Worked exemplar: Strategy", group: "milestone", status: "completed" },
  { id: "static-build", title: "Static build: content/**/*.md → JSON", group: "milestone", status: "completed" },
  { id: "react-browser", title: "React browser: sidebar, search, kata view, language tabs, light/dark", group: "milestone", status: "completed" },
  { id: "dev-script", title: "dev.sh one-command start", group: "milestone", status: "completed" },
  { id: "solid-foundations", title: "SOLID foundations (5 principles)", group: "milestone", status: "completed" },
  { id: "nodejs-tab", title: "Node.js language tab for pattern katas", group: "milestone", status: "completed" },
  { id: "structure-diagrams", title: "Structure diagrams (SVG) for all 28", group: "milestone", status: "completed" },
  { id: "rich-uml", title: "Rich UML: members, arrowheads, stereotypes", group: "milestone", status: "completed", note: "native YSL tree via the fixed yappy export" },
  { id: "wire-diagrams", title: "Wire diagrams into the frontend", group: "milestone", status: "completed" },
  { id: "attribution-footer", title: "Attribution footer baked into diagrams", group: "milestone", status: "completed" },
  { id: "status-bar", title: "Footer status bar (copyright, site link, version, hard reload)", group: "milestone", status: "completed" },
  { id: "static-deploy", title: "Static deploy to GitHub Pages", group: "milestone", status: "in-progress", note: "deploy.sh wired to `npm run deploy`; not yet published" },
  { id: "content-fetched-json", title: "Move content to a fetched JSON asset (shrink bundle)", group: "milestone", status: "todo" },
  { id: "go-content-api", title: "Optional Go content API (net/http)", group: "milestone", status: "todo", note: "static build already covers hosting" },
] as const;

// ── Local overrides (persisted to IndexedDB) ───────────────────────────────
// Each record is { status, updatedAt } keyed by item id — the timestamp gives a
// later LMS sync a last-write-wins signal.
interface OverrideRecord {
  status: ProgressStatus;
  updatedAt: number;
}

const store = createKvStore("skillz-katas", "progress");

// In-memory overlay for synchronous reads; hydrated from the store on load.
let overrides: Record<string, ProgressStatus> = {};

const ready: Promise<void> = store
  .getAll()
  .then((rows) => {
    for (const [id, rec] of Object.entries(rows)) {
      const status = (rec as OverrideRecord)?.status;
      if (status === "completed" || status === "in-progress" || status === "todo") {
        overrides[id] = status;
      }
    }
  })
  .catch(() => {
    /* storage unavailable — fall back to shipped statuses */
  });

// ── Item assembly ──────────────────────────────────────────────────────────
function patternItems(): ProgressItem[] {
  return katas.map((k) => ({
    id: k.id,
    title: k.title,
    group: k.category as ProgressItem["group"],
    status: "completed" as ProgressStatus,
    note: "kata + structure diagram",
  }));
}

function items(): ProgressItem[] {
  const base = [...MILESTONES, ...patternItems()];
  return base.map((i) => (overrides[i.id] ? { ...i, status: overrides[i.id] } : i));
}

// ── Public API ─────────────────────────────────────────────────────────────
export const Progress = {
  /** Every tracked item — milestones followed by the 28 katas. */
  all(): ProgressItem[] {
    return items();
  },
  milestones(): ProgressItem[] {
    return items().filter((i) => i.group === "milestone");
  },
  patterns(): ProgressItem[] {
    return items().filter((i) => i.group !== "milestone");
  },
  get(id: string): ProgressItem | undefined {
    return items().find((i) => i.id === id);
  },
  byStatus(status: ProgressStatus): ProgressItem[] {
    return items().filter((i) => i.status === status);
  },
  byGroup(group: ProgressItem["group"]): ProgressItem[] {
    return items().filter((i) => i.group === group);
  },
  isCompleted(id: string): boolean {
    return this.get(id)?.status === "completed";
  },
  /** Resolves once persisted overrides have hydrated from IndexedDB. */
  ready,
  /**
   * Set an item's status. Updates the in-memory overlay immediately and persists to
   * IndexedDB in the background. Returns false for unknown ids.
   */
  setStatus(id: string, status: ProgressStatus): boolean {
    if (!items().some((i) => i.id === id)) return false;
    overrides = { ...overrides, [id]: status };
    void store.set(id, { status, updatedAt: Date.now() } satisfies OverrideRecord);
    return true;
  },
  markCompleted(id: string): boolean {
    return this.setStatus(id, "completed");
  },
  /** Drop all local overrides, reverting to the shipped statuses. */
  reset(): void {
    overrides = {};
    void store.clear();
  },
  summary(): ProgressSummary {
    const all = items();
    const count = (s: ProgressStatus) => all.filter((i) => i.status === s).length;
    const completed = count("completed");
    return {
      total: all.length,
      completed,
      inProgress: count("in-progress"),
      todo: count("todo"),
      percent: all.length ? Math.round((completed / all.length) * 100) : 0,
    };
  },
};

export type ProgressApi = typeof Progress;

// Expose on the global for console / external-script access (browser only).
if (typeof window !== "undefined") {
  (window as unknown as { KatasProgress: ProgressApi }).KatasProgress = Progress;
}
