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
for (const message of failures) console.error(message);

let failed = failures.length;
for (const [label, ok] of checks) {
  if (!ok) failed++;
  console.log((ok ? "  ok   " : "  FAIL ") + label);
}

console.log("smoke: " + (checks.length - (failed - failures.length)) + "/" + checks.length + " checks passed, " + requests.length + " API calls attempted (entry: " + entryPath + ")");
process.exit(failed ? 1 : 0);
