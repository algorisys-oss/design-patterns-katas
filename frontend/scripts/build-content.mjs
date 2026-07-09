// Compiles content/**/*.md into a single JSON file the React app imports.
// Runs at `npm run content` (and before dev/build). No backend needed — this is
// what makes the site statically hostable.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { marked } from "marked";
import hljs from "highlight.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = resolve(__dirname, "../../content");
const OUT_DIR = resolve(__dirname, "../src/data");
const CATEGORY_ORDER = ["creational", "structural", "behavioral"];
const LANG_ORDER = ["javascript", "python", "elixir", "go"];
const HLJS_ALIAS = { javascript: "javascript", js: "javascript", python: "python", elixir: "elixir", go: "go" };

// ---- markdown → HTML with syntax highlighting ----
marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    code({ text, lang }) {
      const key = (lang || "").toLowerCase();
      const language = HLJS_ALIAS[key];
      let html;
      try {
        html = language
          ? hljs.highlight(text, { language }).value
          : hljs.highlightAuto(text).value;
      } catch {
        html = escapeHtml(text);
      }
      return `<pre class="code-block"><code class="hljs language-${key}">${html}</code></pre>`;
    },
  },
});

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function slug(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function md(src) {
  return marked.parse(src.trim());
}

// Split a markdown body into ordered `## ` sections.
function splitSections(body) {
  const lines = body.split("\n");
  const sections = [];
  let current = null;
  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      if (current) sections.push(current);
      current = { title: m[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
    // text before the first `## ` (there is none in our template) is dropped
  }
  if (current) sections.push(current);
  return sections.map((s) => ({ title: s.title, body: s.lines.join("\n") }));
}

// Split the Implementations section into `### <Language>` tab panels.
function parseImplementations(body) {
  const lines = body.split("\n");
  const intro = [];
  const langs = [];
  let current = null;
  for (const line of lines) {
    const m = /^###\s+(.+?)\s*$/.exec(line);
    if (m) {
      if (current) langs.push(current);
      current = { name: m[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      intro.push(line);
    }
  }
  if (current) langs.push(current);
  const panels = langs.map((l) => ({ name: l.name, slug: slug(l.name), html: md(l.lines.join("\n")) }));
  panels.sort((a, b) => {
    const ia = LANG_ORDER.indexOf(a.slug);
    const ib = LANG_ORDER.indexOf(b.slug);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return { intro_html: md(intro.join("\n")), langs: panels };
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".md") && name !== "template.md") out.push(p);
  }
  return out;
}

function buildKata(file) {
  const raw = readFileSync(file, "utf8");
  const { data, content } = matter(raw);
  const sections = splitSections(content);
  const blocks = sections.map((s) => {
    if (s.title.toLowerCase().startsWith("implementation")) {
      const impl = parseImplementations(s.body);
      return { kind: "impl", id: slug(s.title), title: s.title, ...impl };
    }
    return { kind: "prose", id: slug(s.title), title: s.title, html: md(s.body) };
  });

  const tags = data.tags || [];
  const aka = data.also_known_as || [];
  const related = data.related || [];
  const searchParts = [
    data.title,
    data.category,
    data.intent,
    ...tags,
    ...aka,
    ...related,
    content.replace(/```[\s\S]*?```/g, " "), // prose only, drop code
  ];
  return {
    id: data.id,
    title: data.title,
    category: data.category,
    sequence: data.sequence ?? 0,
    gof: data.gof ?? true,
    intent: data.intent || "",
    frequency: data.frequency || "medium",
    difficulty: data.difficulty || "intermediate",
    tags,
    also_known_as: aka,
    related,
    languages: data.languages || LANG_ORDER,
    blocks,
    search: searchParts.join(" • ").toLowerCase(),
  };
}

const files = walk(CONTENT_DIR);
const katas = files.map(buildKata).sort((a, b) => {
  const ca = CATEGORY_ORDER.indexOf(a.category);
  const cb = CATEGORY_ORDER.indexOf(b.category);
  if (ca !== cb) return ca - cb;
  return a.sequence - b.sequence;
});

// Collect the full tag vocabulary for the search/filter UI.
const tagSet = new Set();
for (const k of katas) for (const t of k.tags) tagSet.add(t);

const payload = {
  generatedAt: new Date().toISOString(),
  categories: CATEGORY_ORDER,
  tags: [...tagSet].sort(),
  count: katas.length,
  katas,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "katas.json"), JSON.stringify(payload, null, 2));
console.log(`content: built ${katas.length} kata(s) → src/data/katas.json`);
