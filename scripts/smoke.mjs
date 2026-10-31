#!/usr/bin/env node
/**
 * Headless boot smoke test for Anchor Dashboard.
 *
 * Bundles the frontend entry with esbuild (already installed with Vite), loads
 * index.html into jsdom, stubs the network so the app takes its offline path,
 * and asserts that boot completes and the catalog renders. This catches the
 * runtime errors `vite build` cannot see, which matters because the frontend is
 * split into ES modules without a test framework.
 *
 * Usage: node scripts/smoke.mjs
 */
import fs from "node:fs";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const entryPath = "src/js/main.js";

const markup = fs
  .readFileSync("index.html", "utf8")
  .replace(/<script[^>]*><\/script>/g, "")
  .replace(/<link[^>]*rel="stylesheet"[^>]*>/g, "");

const dom = new JSDOM(markup, { url: "https://smoke.test/", runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;

const failures = [];
window.addEventListener("error", (event) => failures.push("window error: " + (event.error?.stack || event.message)));
window.addEventListener("unhandledrejection", (event) => failures.push("unhandled rejection: " + event.reason));

const requests = [];
window.fetch = async (input, init = {}) => {
  requests.push(String(input) + " " + (init.method || "GET"));
  throw new Error("smoke test: network disabled");
};
window.URL.createObjectURL = () => "blob:smoke";
window.URL.revokeObjectURL = () => {};
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
window.structuredClone = globalThis.structuredClone;
window.scrollTo = () => {};
window.open = () => null;
window.Element.prototype.scrollIntoView = function scrollIntoView() {};
window.confirm = () => true;
window.document.fonts = { ready: Promise.resolve(), addEventListener() {}, forEach() {} };
window.localStorage.clear();

const bundle = await build({ entryPoints: [entryPath], bundle: true, write: false, format: "iife", platform: "browser", target: "es2020", logLevel: "silent" });
const code = bundle.outputFiles[0].text;

let bootError = null;
try {
  window.eval(code);
} catch (error) {
  bootError = error;
}
await new Promise((resolve) => setTimeout(resolve, 250));

const $ = (id) => window.document.getElementById(id);
const checks = [
  ["entry bundled", code.length > 1000],
  ["no boot exception", !bootError],
  ["title is Anchor Dashboard", window.document.title.includes("Anchor Dashboard")],
  ["favorites nav rendered", window.document.querySelectorAll(".nav").length > 0],
  ["services rendered", ["cardArea", "listArea", "dotArea"].some((id) => ($(id)?.innerHTML || "").length > 0)],
  ["all-services counter filled", ($("allServicesCount")?.textContent || "").trim() !== ""],
  ["favorites counter filled", ($("favoritesCount")?.textContent || "").trim() !== ""],
  ["sidebar category nav filled", ($("categoryNav")?.innerHTML || "").length > 0],
  ["settings API attempted", requests.some((request) => request.includes("/api/settings"))],
];

if (bootError) console.error(bootError.stack || String(bootError));
const markupIds = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
function collectIdRefs(dir, found = new Map()) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = dir + "/" + entry.name;
    if (entry.isDirectory()) { collectIdRefs(full, found); continue; }
    if (!full.endsWith(".js")) continue;
    const source = fs.readFileSync(full, "utf8");
    for (const match of source.matchAll(/\$\("([^"]+)"\)/g)) if (!found.has(match[1])) found.set(match[1], full);
  }
  return found;
}
// IDs created by the app at runtime (dialogs, injected rows) are not in index.html.
const RUNTIME_IDS = new Set(["serviceOrderStatus", "clearMostUsed", "taxonomyName", "taxonomyIcon"]);
const missingIds = [...collectIdRefs("src/js").keys()].filter((id) => !markupIds.has(id) && !RUNTIME_IDS.has(id));
checks.push(["every $(id) has an element", missingIds.length === 0]);
if (missingIds.length) console.error("  missing ids: " + missingIds.join(", "));

const tick = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));
const searchInput = $("search");
const typeSearch = async (value) => {
  searchInput.value = value;
  searchInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  await tick();
};

await typeSearch("cloud");
checks.push(["quick results render", !$("quickResults").hidden && $("quickResults").querySelectorAll("[data-quick-index]").length > 0]);
checks.push(["search matches highlighted", ["cardArea", "listArea", "dotArea"].some((id) => ($(id)?.innerHTML || "").includes("search-hit"))]);
searchInput.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
checks.push(["quick result selectable", !!$("quickResults").querySelector(".quick-result.selected")]);
await typeSearch("");

window.document.querySelector('[data-page="all"]').click();
await tick();
$("groupBySetting").value = "category";
$("groupBySetting").dispatchEvent(new window.Event("change", { bubbles: true }));
await tick();
checks.push(["category grouping renders", window.document.querySelectorAll(".catalog-group").length > 1]);
$("groupBySetting").value = "none";
$("groupBySetting").dispatchEvent(new window.Event("change", { bubbles: true }));
await tick();

window.document.querySelector('[data-page="favorites"]').click();
await tick();
const openLink = window.document.querySelector("[data-open-link]");
if (openLink) openLink.click();
await tick();
checks.push(["usage recorded on open", !!window.localStorage.getItem("anchor-usage-v1")]);
checks.push(["most used strip renders", !$("mostUsedArea").hidden && $("mostUsedArea").querySelectorAll(".most-used-card").length > 0]);

window.document.querySelector('[data-page="settings"]').click();
await tick();
checks.push(["settings save state present", ($("settingsSaveState")?.textContent || "").includes("saved")]);
checks.push(["settings sections present", ["settingsIdentity", "settingsAppearance", "settingsStorage", "settingsData", "settingsAbout", "settingsCache"].every((id) => !!$(id))]);
checks.push(["settings status pills painted", ["d1StatusPill", "r2StatusPill", "pagesStatusPill"].every((id) => $(id) && /is-(ok|bad|pending)/.test($(id).className))]);
const dirtyProbe = $("brandingName");
dirtyProbe.value = "Anchor Probe";
dirtyProbe.dispatchEvent(new window.Event("input", { bubbles: true }));
checks.push(["unsaved changes indicator", $("settingsSavebar").classList.contains("is-dirty")]);

if (bootError) console.error(bootError.stack || String(bootError));
for (const message of failures) console.error(message);

let failed = failures.length;
for (const [label, ok] of checks) {
  if (!ok) failed++;
  console.log((ok ? "  ok   " : "  FAIL ") + label);
}

console.log("smoke: " + (checks.length - (failed - failures.length)) + "/" + checks.length + " checks passed, " + requests.length + " API calls attempted (entry: " + entryPath + ")");
process.exit(failed ? 1 : 0);
