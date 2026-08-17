// Compiles content/**/*.md into a single JSON file the React app imports.
// Runs at `npm run content` (and before dev/build). No backend needed — this is
// what makes the site statically hostable.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { marked } from "marked";
import hljs from "highlight.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = resolve(__dirname, "../../content");
const OUT_DIR = resolve(__dirname, "../src/data");
// Category order comes from the shared registry (src/lib/categories.json) so the build
// and the app agree, and new families are a one-entry data change.
const CATEGORY_ORDER = JSON.parse(
  readFileSync(resolve(__dirname, "../src/lib/categories.json"), "utf8"),
).map((c) => c.slug);
const LANG_ORDER = ["javascript", "node-js", "python", "elixir", "go", "java", "csharp", "rust", "zig"];
// zig has no hljs grammar (11.x) — its fences fall through to highlightAuto.
const HLJS_ALIAS = { javascript: "javascript", js: "javascript", python: "python", elixir: "elixir", go: "go", java: "java", csharp: "csharp", cs: "csharp", rust: "rust" };

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

// Load the pre-rendered structure diagram that sits beside each kata:
//   content/<category>/<NN-slug>.md  →  content/<category>/diagrams/<NN-slug>/structure.svg
// Returns an inline, theme-friendly <figure> (or null if the kata has no diagram).
function loadDiagram(file) {
  const svgPath = join(dirname(file), "diagrams", basename(file, ".md"), "structure.svg");
  let svg;
  try {
    svg = readFileSync(svgPath, "utf8");
  } catch {
    return null;
  }
  // Keep the intrinsic width/height (and viewBox) so CSS can bound the diagram by both
  // dimensions without upscaling it — a tall, narrow diagram must not be blown up to
  // the full column width. Just tag it for styling.
  svg = svg.replace(/<svg([^>]*)>/, (_m, attrs) => {
    let a = attrs;
    if (!/preserveAspectRatio/.test(a)) a += ' preserveAspectRatio="xMidYMid meet"';
    return `<svg${a} class="structure-svg" role="img">`;
  });
  return `<figure class="structure-diagram">${svg}</figure>`;
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "templates") out.push(...walk(p)); // authoring skeletons, not katas
    } else if (name.endsWith(".md") && name !== "template.md") {
      out.push(p);
    }
  }
  return out;
}

// Turn [[kata-id]] cross-references into clickable links to the target kata. The app is
// hash-routed (#/kata/:id), so these work on any static host. An unknown id is left as raw
// text — `node scripts/lint-content.mjs` fails on it.
function linkWikilinks(md, titleById) {
  return md.replace(/\[\[([a-z0-9-]+)\]\]/g, (m, id) => {
    const title = titleById.get(id);
    return title ? `[${title}](#/kata/${id})` : m;
  });
}

function buildKata(file, titleById) {
  const raw = readFileSync(file, "utf8");
  const { data, content: rawContent } = matter(raw);
  const content = linkWikilinks(rawContent, titleById);
  const sections = splitSections(content);
  const blocks = sections.map((s) => {
    if (s.title.toLowerCase().startsWith("implementation")) {
      const impl = parseImplementations(s.body);
      return { kind: "impl", id: slug(s.title), title: s.title, ...impl };
    }
    return { kind: "prose", id: slug(s.title), title: s.title, html: md(s.body) };
  });

  // Wire the structure diagram in: append it to the Structure section, or — for the
  // SOLID principles, which have no Structure heading — insert one right after the intro.
  const figure = loadDiagram(file);
  if (figure) {
    const structure = blocks.find((b) => b.id === "structure" && b.kind === "prose");
    if (structure) {
      structure.html += figure;
    } else {
      blocks.splice(1, 0, { kind: "prose", id: "structure", title: "Structure", html: figure });
    }
  }

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
    kind: data.kind || "pattern",
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
// First pass: id → title, so [[id]] cross-references can resolve to the target's title.
const titleById = new Map();
for (const f of files) {
  const { data } = matter(readFileSync(f, "utf8"));
  if (data.id) titleById.set(data.id, data.title);
}
const katas = files.map((f) => buildKata(f, titleById)).sort((a, b) => {
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
