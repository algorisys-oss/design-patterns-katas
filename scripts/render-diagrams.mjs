// Renders diagram source files (Mermaid / YSL) to SVG using the yappy app headlessly.
//
// yappy has no Node-only SVG exporter — export needs the browser DOM — so we drive the
// running app through Playwright: window.Yappy.importDSL(src) then window.Yappy.exportSVG().
//
// Prereq: yappy vite server running (default http://localhost:5173).
//   cd /home/rajesh/work/algo/yappy && npx vite --port 5173 --strictPort
//
// Run from the yappy dir so `playwright` resolves (its chromium lives there):
//   node /home/rajesh/lab/katas/design-patterns/scripts/render-diagrams.mjs
//
// Discovers every content/**/diagrams/**/*.{mmd,ysl} and writes a sibling .svg.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// yappy owns the Playwright install; resolve it by absolute path since ESM looks
// up bare specifiers relative to this file, not the cwd.
const PW = process.env.PLAYWRIGHT_PATH || "/home/rajesh/work/algo/yappy/node_modules/playwright/index.js";
const pw = await import(pathToFileURL(PW).href);
const chromium = pw.chromium ?? pw.default?.chromium;
if (!chromium) throw new Error("could not load chromium from " + PW);

const CONTENT = "/home/rajesh/lab/katas/design-patterns/content";
const URL = process.env.YAPPY_URL || "http://localhost:5173";

function findSources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...findSources(p));
    else if (/\.(mmd|ysl)$/.test(name)) out.push(p);
  }
  return out;
}

const sources = findSources(CONTENT);
if (sources.length === 0) {
  console.log("no diagram sources found under", CONTENT);
  process.exit(0);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on("pageerror", (e) => console.error("  page error:", e.message));

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.Yappy !== "undefined", { timeout: 30_000 });

// Bake an attribution footer into the exported SVG: grow the viewBox/height to make
// room, then drop a centered credit line beneath the diagram. Baking it in (rather than
// adding it in the frontend) keeps the attribution attached to the artifact and means it
// survives every re-render.
const FOOTER_H = 50;
const FOOTER_FONT = 16;
const FOOTER_TEXT = "Made with yappydraw.com by Algorisys Technologies";
function addFooter(svg) {
  const tag = svg.match(/<svg[^>]*>/)?.[0];
  const vb = tag?.match(/viewBox="\s*([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s*"/);
  if (!tag || !vb) return svg;
  const minX = +vb[1], minY = +vb[2], w = +vb[3], h = +vb[4];

  // A narrow diagram is thinner than the credit line — widen the canvas symmetrically so
  // the footer isn't clipped, which also re-centers the diagram content. 0.55·fontSize is a
  // safe per-glyph width estimate for Handlee; err generous rather than clip.
  const footerW = FOOTER_TEXT.length * FOOTER_FONT * 0.55;
  const newW = Math.max(w, footerW + 40);
  const newMinX = minX - (newW - w) / 2;
  const newH = h + FOOTER_H;

  // yappy sets width/height equal to the viewBox extent — keep them in lockstep.
  const newTag = tag
    .replace(/viewBox="[^"]*"/, `viewBox="${newMinX} ${minY} ${newW} ${newH}"`)
    .replace(/width="[^"]*"/, `width="${newW}"`)
    .replace(/height="[^"]*"/, `height="${newH}"`);
  const footer =
    `<text x="${newMinX + newW / 2}" y="${minY + h + FOOTER_H * 0.62}" text-anchor="middle" ` +
    `font-family="Handlee, cursive" font-size="${FOOTER_FONT}" fill="#9aa4b0">${FOOTER_TEXT}</text>`;
  return svg.replace(tag, newTag).replace(/<\/svg>\s*$/, footer + "</svg>");
}

let ok = 0;
let failed = 0;
for (const src of sources) {
  const source = readFileSync(src, "utf8");
  const out = src.replace(/\.(mmd|ysl)$/, ".svg");
  try {
    const raw = await page.evaluate((text) => {
      window.Yappy.clear();
      window.Yappy.importDSL(text);
      return window.Yappy.exportSVG(false);
    }, source);
    if (!raw || !raw.includes("<svg")) throw new Error("empty or invalid SVG");
    const svg = addFooter(raw);
    writeFileSync(out, svg);
    console.log("  ✓", out.replace(CONTENT + "/", ""), `(${svg.length} bytes)`);
    ok++;
  } catch (e) {
    console.error("  ✗", src.replace(CONTENT + "/", ""), "-", e.message);
    failed++;
  }
}

await browser.close();
console.log(`\ndiagrams: ${ok} rendered, ${failed} failed`);
process.exit(failed ? 1 : 0);
