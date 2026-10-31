import fs from "node:fs";
import path from "node:path";

const SOURCE = "index.html";
const OUT_DIR = "src/styles";

// Slices are 1-based inclusive line ranges of the original <style> block, in
// document order. Order is preserved because the stylesheet is a stack of
// versioned override layers.
const SLICES = [
  [13, 20, "00-tokens.css", "design tokens and reset"],
  [21, 105, "10-sidebar.css", "modern sidebar visual system"],
  [106, 185, "20-settings.css", "settings page"],
  [186, 222, "21-admin.css", "admin layout refinements and viewport fit"],
  [223, 251, "30-catalog.css", "compact service catalog"],
  [252, 285, "31-slim-cards.css", "slim-card mode"],
  [286, 315, "32-service-order.css", "reorder toggle, drag handles, favorites layout"],
  [316, 352, "33-sidebar-nav.css", "sidebar tag filter and compact category/tag rows"],
  [353, 398, "34-dialogs.css", "app-native confirm and taxonomy dialogs"],
  [399, 414, "35-sidebar-controls.css", "sidebar section controls and inline create"],
  [415, 436, "36-logos.css", "service logo sizing"],
  [437, 552, "37-catalog-controls.css", "display controls, collapsible filters, header controls"],
  [553, 634, "40-card-refinement.css", "service card layout refinement"],
  [635, 728, "50-service-editor.css", "service editor viewport and tag picker"],
  [729, 761, "51-tag-admin.css", "tag administration"],
  [762, 895, "90-anchor.css", "Anchor design system (highest layer, stays last)"],
];

const lines = fs.readFileSync(SOURCE, "utf8").split("\n");
if (lines[11].trim() !== "<style>") throw new Error("Unexpected <style> position: line 12 is " + JSON.stringify(lines[11]));
const close = lines.findIndex((line, index) => index > 11 && line.includes("</style>"));
if (close !== 895) throw new Error("Unexpected </style> line: " + (close + 1));

fs.mkdirSync(OUT_DIR, { recursive: true });

let originalCss = 0;
let writtenCss = 0;
const imports = [];

for (const [start, end, file, title] of SLICES) {
  const body = lines.slice(start - 1, end).join("\n");
  originalCss += body.length + 1;
  const header = "/* Anchor Dashboard - " + title + ".\n   Extracted from the single-file stylesheet; layer order is load-bearing,\n   see the @import order in index.css. */\n";
  const content = header + body + "\n";
  fs.writeFileSync(path.join(OUT_DIR, file), content);
  writtenCss += content.length;
  imports.push('@import "./' + file + '";');
  console.log("wrote " + file + "  lines " + start + "-" + end + "  " + content.length + " bytes");
}

const indexCss = "/* Anchor Dashboard stylesheet entry point.\n   The import order mirrors the original inline stylesheet exactly: later files\n   override earlier ones, and 90-anchor.css must stay last. */\n" + imports.join("\n") + "\n";
fs.writeFileSync(path.join(OUT_DIR, "index.css"), indexCss);
console.log("wrote index.css with " + imports.length + " imports");

const head = lines.slice(0, 11);
const tail = lines.slice(close + 1);
const html = head.concat(['<link rel="stylesheet" href="./src/styles/index.css" />'], tail).join("\n");
fs.writeFileSync(SOURCE, html);

console.log("original css body: " + originalCss + " bytes | headers added: " + (writtenCss - originalCss - SLICES.length) + " bytes");
console.log("index.html now " + html.split("\n").length + " lines");
