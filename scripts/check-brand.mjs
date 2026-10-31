#!/usr/bin/env node
/**
 * Anchor Dashboard brand guard.
 *
 * Replaces the former .github/workflows/build.yml action, which only ran
 * `npm run build` and never inspected the frontend for theme drift. This script
 * fails the build when legacy Luxorit colours, dark/light theme machinery, or
 * retired branding reappear anywhere in the shipped source.
 *
 * Usage: npm run check:brand
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".wrangler", "prototype", "scripts", "migrations"]);
const SCAN_EXTENSIONS = new Set([".html", ".css", ".js", ".mjs"]);
const SCAN_FILES = ["README.md"];

// Colours owned by the retired Luxorit palette. Third-party brand marks
// (Cloudflare, Microsoft, category icon tones) are intentionally colour-accurate
// and are not listed here.
const LEGACY_COLORS = [
  "#F0B45A", "#3ECF8E", "#191C22", "#403426", "#14211B", "#102019",
  "#8B9AAA", "#E8B84A", "#94A3B8", "#3B424C", "#69E2AD",
  "#9CA3AF", "#A1A1AA", "#0F172A",
];

const FORBIDDEN_PATTERNS = [
  [/\[data-theme/i, "theme-scoped selector"],
  [/prefers-color-scheme/i, "OS colour-scheme query"],
  [/dataset\.theme/, "runtime theme toggle"],
  [/themeSetting/, "theme picker control"],
  [/color-scheme:\s*(dark|light dark)/i, "dark colour-scheme declaration"],
];

// The retired name is still legitimate in two places: the D1 database name
// (`luxorit-portal-db`, renaming infrastructure is out of scope) and the legacy
// localStorage namespace, which is read exactly once to migrate existing
// browsers. Everything else containing the old name is a regression.
const LEGACY_IDENTIFIERS = /luxorit-(portal-db|portal-v1|profile-cache-v1)/gi;
const RETIRED_BRAND = /\bluxorit\b/i;

const REQUIRED = [
  { file: "index.html", needle: "Anchor Dashboard", label: "document title" },
  { file: "functions/api/settings.js", needle: 'theme: "anchor"', label: "locked server theme" },
  { file: "functions/api/settings.js", needle: 'name: "Anchor"', label: "server branding default" },
];

const REQUIRED_TOKENS = [
  "--anchor-navy", "--anchor-action", "--anchor-page", "--anchor-primary",
  "--anchor-border", "--sidebar-surface", "--status-danger", "--star",
];

function walk(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, found);
      continue;
    }
    if (SCAN_EXTENSIONS.has(path.extname(entry.name))) found.push(full);
  }
  return found;
}

const violations = [];
const files = new Set(walk(root));
for (const extra of SCAN_FILES) {
  const full = path.join(root, extra);
  if (fs.existsSync(full)) files.add(full);
}

for (const file of files) {
  const relative = path.relative(root, file).replace(/\\/g, "/");
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const upper = line.toUpperCase();
    for (const color of LEGACY_COLORS) {
      if (upper.includes(color)) violations.push({ relative, line: index + 1, message: "legacy colour " + color });
    }
    if (RETIRED_BRAND.test(line.replace(LEGACY_IDENTIFIERS, ""))) violations.push({ relative, line: index + 1, message: "retired brand name" });
    for (const [pattern, message] of FORBIDDEN_PATTERNS) {
      if (pattern.test(line)) violations.push({ relative, line: index + 1, message });
    }
  });
}

for (const rule of REQUIRED) {
  const full = path.join(root, rule.file);
  const source = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
  if (!source.includes(rule.needle)) violations.push({ relative: rule.file, line: 0, message: "missing " + rule.label + " (expected " + rule.needle + ")" });
}

const tokenFile = path.join(root, "src/styles/00-tokens.css");
const legacyStyleHost = fs.existsSync(tokenFile) ? path.join(root, "index.html") : null;
if (fs.existsSync(tokenFile)) {
  const tokens = fs.readFileSync(tokenFile, "utf8");
  for (const token of REQUIRED_TOKENS) {
    if (!tokens.includes(token)) violations.push({ relative: "src/styles/00-tokens.css", line: 0, message: "missing token " + token });
  }
}
if (legacyStyleHost) {
  const html = fs.readFileSync(legacyStyleHost, "utf8");
  if (html.includes("<style")) violations.push({ relative: "index.html", line: 0, message: "inline <style> block remains after CSS extraction" });
  if (!html.includes("src/styles/index.css")) violations.push({ relative: "index.html", line: 0, message: "missing link to src/styles/index.css" });
}

if (violations.length) {
  console.error("Brand check failed with " + violations.length + " violation(s):");
  for (const item of violations) {
    console.error("  " + item.relative + (item.line ? ":" + item.line : "") + "  " + item.message);
  }
  process.exit(1);
}

console.log("Brand check passed: " + files.size + " files, " + (LEGACY_COLORS.length + FORBIDDEN_PATTERNS.length) + " rules, " + REQUIRED.length + " required markers.");
