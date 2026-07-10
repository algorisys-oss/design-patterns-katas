// Content linter for the kata catalog. Catches the drift the build silently tolerates:
//   ERROR  — duplicate id, unknown category, dangling `related:` id, dangling [[wiki-link]]
//   WARN   — languages/impl-tab mismatch, missing structure diagram
//
// Run from the repo root:  node scripts/lint-content.mjs   (exit 1 if any ERROR)
//
// Deliberately dependency-free (no gray-matter) so it runs without installing frontend deps.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = join(ROOT, "content");
const CATEGORIES = new Set(
  JSON.parse(readFileSync(join(ROOT, "frontend/src/lib/categories.json"), "utf8")).map((c) => c.slug),
);

const slug = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "templates" && name !== "diagrams") out.push(...walk(p));
    } else if (name.endsWith(".md") && name !== "template.md") {
      out.push(p);
    }
  }
  return out;
}

// Minimal frontmatter reader — our YAML is flat scalars and inline [ ] arrays.
function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  const fm = m ? m[1] : "";
  const scalar = (k) => (fm.match(new RegExp(`^${k}:\\s*(.+)$`, "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
  const list = (k) => {
    const raw = (fm.match(new RegExp(`^${k}:\\s*\\[(.*)\\]`, "m")) || [])[1];
    return raw ? raw.split(",").map((x) => x.trim()).filter(Boolean) : [];
  };
  return { id: scalar("id"), category: scalar("category"), kind: scalar("kind"), related: list("related"), languages: list("languages") };
}

// The `### <Tab>` headers inside the Implementations section, slugified.
function implTabs(body) {
  const impl = body.split(/^## /m).find((s) => /^implementation/i.test(s));
  if (!impl) return [];
  return [...impl.matchAll(/^###\s+(.+?)\s*$/gm)].map((mm) => slug(mm[1]));
}

const files = walk(CONTENT);
const errors = [];
const warns = [];
const ids = new Map(); // id -> file
const katas = [];

for (const file of files) {
  const rel = file.replace(CONTENT + "/", "");
  const text = readFileSync(file, "utf8");
  const fm = frontmatter(text);

  if (!fm.id) { errors.push(`${rel}: missing frontmatter id`); continue; }
  if (ids.has(fm.id)) errors.push(`${rel}: duplicate id "${fm.id}" (also ${ids.get(fm.id)})`);
  ids.set(fm.id, rel);

  if (!fm.category) errors.push(`${rel}: missing category`);
  else if (!CATEGORIES.has(fm.category)) errors.push(`${rel}: unknown category "${fm.category}" (not in categories.json)`);

  const wikilinks = [...text.matchAll(/\[\[([a-z0-9-]+)\]\]/g)].map((mm) => mm[1]);
  const tabs = implTabs(text);
  katas.push({ rel, fm, wikilinks, tabs });

  // languages vs impl tabs — a mismatch means a stale tab or stale frontmatter.
  const langs = [...fm.languages].sort();
  const t = [...new Set(tabs)].sort();
  if (fm.kind === "playbook") {
    if (fm.languages.length) warns.push(`${rel}: playbook should have languages: []`);
  } else if (t.length && JSON.stringify(langs) !== JSON.stringify(t)) {
    warns.push(`${rel}: languages ${JSON.stringify(langs)} != impl tabs ${JSON.stringify(t)}`);
  }

  // missing structure diagram (warning — diagrams are optional but encouraged)
  const svg = join(dirname(file), "diagrams", basename(file, ".md"), "structure.svg");
  if (!existsSync(svg)) warns.push(`${rel}: no structure diagram (${svg.replace(CONTENT + "/", "")})`);
}

// Dangling references — resolved after every id is known.
const known = new Set(ids.keys());
for (const { rel, fm, wikilinks } of katas) {
  for (const r of fm.related) if (!known.has(r)) errors.push(`${rel}: related id "${r}" does not exist`);
  for (const w of new Set(wikilinks)) if (!known.has(w)) errors.push(`${rel}: [[${w}]] does not resolve to a kata id`);
}

const line = (s) => console.log("  " + s);
if (errors.length) { console.log(`\nERRORS (${errors.length}):`); errors.forEach(line); }
if (warns.length) { console.log(`\nWARNINGS (${warns.length}):`); warns.forEach(line); }
console.log(`\ncontent-lint: ${katas.length} katas · ${errors.length} error(s) · ${warns.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
