// Central category registry — the single source of truth for the family taxonomy:
// order, display labels, one-line blurbs, and which track a family belongs to.
//
// Both this app and the content build (frontend/scripts/build-content.mjs) read the
// same categories.json, so adding a new family (cloud, devops, ui, security, …) is a
// one-entry data change — no code edits scattered across components. A family with no
// katas yet simply doesn't appear in the UI until content lands under content/<slug>/.

import raw from "./categories.json";

export type CategoryTrack = "foundations" | "gof" | "modern";

export interface Category {
  slug: string;
  label: string;
  blurb: string;
  track: CategoryTrack;
  gof: boolean;
}

export const CATEGORIES: Category[] = raw as Category[];

const BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

/** Human label for a category slug (falls back to the slug if unknown). */
export function categoryLabel(slug: string): string {
  return BY_SLUG.get(slug)?.label ?? slug;
}

/** One-line description for a category slug (empty string if unknown). */
export function categoryBlurb(slug: string): string {
  return BY_SLUG.get(slug)?.blurb ?? "";
}

export function categoryMeta(slug: string): Category | undefined {
  return BY_SLUG.get(slug);
}

/** Canonical order index for a slug (unknown slugs sort last). */
export function categoryOrder(slug: string): number {
  const i = CATEGORIES.findIndex((c) => c.slug === slug);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}
