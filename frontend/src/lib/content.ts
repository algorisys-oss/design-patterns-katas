import data from "@/data/katas.json";

export type Block =
  | { kind: "prose"; id: string; title: string; html: string }
  | {
      kind: "impl";
      id: string;
      title: string;
      intro_html: string;
      langs: { name: string; slug: string; html: string }[];
    };

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
  blocks: Block[];
  search: string;
}

export interface KataData {
  generatedAt: string;
  categories: string[];
  tags: string[];
  count: number;
  katas: Kata[];
}

export const kataData = data as unknown as KataData;
export const katas = kataData.katas;
export const categories = kataData.categories;
export const allTags = kataData.tags;

export function getKata(id: string): Kata | undefined {
  return katas.find((k) => k.id === id);
}

export function groupByCategory(list: Kata[]): [string, Kata[]][] {
  return categories
    .map((c) => [c, list.filter((k) => k.category === c)] as [string, Kata[]])
    .filter(([, ks]) => ks.length > 0);
}

// Canonical reading order — same as the sidebar: category order, then sequence within.
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

// Search across title, intent, tags, category, related, and body prose.
export function searchKatas(query: string, activeTags: string[]): Kata[] {
  const q = query.trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  return katas.filter((k) => {
    const tagOk = activeTags.length === 0 || activeTags.every((t) => k.tags.includes(t));
    const termOk = terms.every((t) => k.search.includes(t));
    return tagOk && termOk;
  });
}
