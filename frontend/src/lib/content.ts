import index from "@/data/katas-index.json";

export type Block =
  | { kind: "prose"; id: string; title: string; html: string }
  | {
      kind: "impl";
      id: string;
      title: string;
      intro_html: string;
      langs: { name: string; slug: string; html: string }[];
    };

// Everything the sidebar, routing, and breadcrumb need. Bundled with the app
// (~60 KB) so navigation never waits on a network round-trip.
export interface Kata {
  id: string;
  title: string;
  category: string;
  kind: string;
  sequence: number;
  gof: boolean;
  intent: string;
  frequency: string;
  difficulty: string;
  tags: string[];
  also_known_as: string[];
  related: string[];
  languages: string[];
}

export interface KataIndex {
  generatedAt: string;
  categories: string[];
  tags: string[];
  count: number;
  katas: Kata[];
}

export const kataIndex = index as unknown as KataIndex;
export const katas = kataIndex.katas;
export const categories = kataIndex.categories;
export const allTags = kataIndex.tags;

export function getKata(id: string): Kata | undefined {
  return katas.find((k) => k.id === id);
}

export function groupByCategory(list: Kata[]): [string, Kata[]][] {
  return categories
    .map((c) => [c, list.filter((k) => k.category === c)] as [string, Kata[]])
    .filter(([, ks]) => ks.length > 0);
}

// Canonical reading order, same as the sidebar: category order, then sequence within.
export const orderedKatas: Kata[] = categories.flatMap((c) =>
  katas.filter((k) => k.category === c).sort((a, b) => a.sequence - b.sequence),
);

// The previous/next kata in reading order, for page-to-page navigation.
export function getAdjacent(id: string): { prev?: Kata; next?: Kata } {
  const i = orderedKatas.findIndex((k) => k.id === id);
  if (i === -1) return {};
  return {
    prev: i > 0 ? orderedKatas[i - 1] : undefined,
    next: i < orderedKatas.length - 1 ? orderedKatas[i + 1] : undefined,
  };
}

// ---- fetched on demand ----
// The rendered HTML (~4.4 MB across all katas) and the full-text search index
// (~870 KB) are assets, not bundle. BASE_URL keeps them correct under the
// project-site subpath GitHub Pages serves from.
const asset = (path: string) => `${import.meta.env.BASE_URL}content/${path}`;

const blockCache = new Map<string, Promise<Block[]>>();

/** The rendered body of one kata. Cached, so revisiting is instant. */
export function loadBlocks(id: string): Promise<Block[]> {
  let pending = blockCache.get(id);
  if (!pending) {
    pending = fetch(asset(`katas/${encodeURIComponent(id)}.json`))
      .then((r) => {
        if (!r.ok) throw new Error(`kata ${id}: HTTP ${r.status}`);
        return r.json();
      })
      .then((d: { blocks: Block[] }) => d.blocks)
      .catch((err) => {
        // Don't cache a failure: a reload or a flaky network should retry.
        blockCache.delete(id);
        throw err;
      });
    blockCache.set(id, pending);
  }
  return pending;
}

let searchIndex: Promise<Record<string, string>> | null = null;

/** id -> lowercased body prose, for full-text search. Fetched once, on first use. */
export function loadSearchIndex(): Promise<Record<string, string>> {
  if (!searchIndex) {
    searchIndex = fetch(asset("search.json"))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`search: HTTP ${r.status}`))))
      .catch((err) => {
        searchIndex = null;
        throw err;
      });
  }
  return searchIndex;
}

// Metadata every kata carries in the bundle, so search works before (and even
// without) the full-text index.
function metaText(k: Kata): string {
  return [k.title, k.intent, k.category, k.kind, ...k.tags, ...k.also_known_as, ...k.related]
    .join(" • ")
    .toLowerCase();
}

/**
 * Filter by tag and query. Matching runs over title/intent/tags immediately and
 * widens to body prose once `fullText` has loaded, so typing is never blocked on
 * the network.
 */
export function searchKatas(
  query: string,
  activeTags: string[],
  fullText?: Record<string, string> | null,
): Kata[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return katas.filter((k) => {
    const tagOk = activeTags.length === 0 || activeTags.every((t) => k.tags.includes(t));
    if (!tagOk) return false;
    if (terms.length === 0) return true;
    const haystack = metaText(k) + " " + (fullText?.[k.id] ?? "");
    return terms.every((t) => haystack.includes(t));
  });
}
