#!/usr/bin/env node
/**
 * Optional browser pass for Anchor Dashboard: real Chrome or Edge, the real dev
 * server, and real Cache Storage. jsdom (npm run check:smoke) cannot see layout
 * or the browser cache, so this script covers what it cannot:
 *
 *   - uploads a logo, attaches it to a service, and replaces it (edge eviction)
 *   - counts /api/assets requests on first paint versus after a reload
 *   - quick results (typing, arrow keys, Escape), grouping, Settings layout,
 *     jump nav, sticky save bar, and unsaved-change tracking
 *   - screenshots every page into a temp folder for visual review
 *
 * It mutates only the local D1/R2 emulation and restores the service it touches.
 * It is not part of npm run verify because it needs a local browser and about a
 * minute of wall clock time.
 *
 * Usage: npm run check:browser
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = 5173;
const CDP_PORT = 9411;
const BASE = `http://127.0.0.1:${PORT}`;
const BROWSERS = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const CHROME = BROWSERS.find((candidate) => fs.existsSync(candidate)) || "";
if (!CHROME) {
  console.log("browser: skipped - no Chrome or Edge found. Set CHROME_PATH to run this check.");
  process.exit(0);
}
const OUT = path.join(os.tmpdir(), "anchor-shots");
fs.mkdirSync(OUT, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "anchor-cdp-"));
const log = fs.createWriteStream(path.join(os.tmpdir(), "anchor-dev.log"));

const results = [];
const check = (label, ok, extra = "") => results.push([label, Boolean(ok), extra]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(BASE + "/");
      if (response.ok) return true;
    } catch {}
    await sleep(1000);
  }
  return false;
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve());
      this.ws.addEventListener("error", (event) => reject(new Error("CDP socket error: " + event.message)));
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      } else if (message.method) {
        this.events.push(message);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async evaluate(expression, awaitPromise = false) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + " " + (result.exceptionDetails.exception?.description || ""));
    return result.result.value;
  }
  waitFor(expression, timeout = 10000) {
    return this.evaluate(
      `new Promise((resolve)=>{const start=Date.now();(function tick(){let ok=false;try{ok=!!(${expression})}catch(error){}if(ok)return resolve(true);if(Date.now()-start>${timeout})return resolve(false);requestAnimationFrame(tick)})()})`,
      true
    );
  }
  async shot(name) {
    const { data } = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    const file = path.join(OUT, name + ".png");
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    return file;
  }
  errors() {
    return this.events
      .filter((event) => event.method === "Runtime.exceptionThrown" || (event.method === "Runtime.consoleAPICalled" && event.params.type === "error") || event.method === "Log.entryAdded")
      .map((event) => event.method === "Runtime.exceptionThrown" && event.params.exceptionDetails?.exception?.description
        ? String(event.params.exceptionDetails.exception.description).split("\n").slice(0, 2).join(" ")
        : event.method === "Log.entryAdded"
        ? (event.params.entry.url ? event.params.entry.url + " " : "") + event.params.entry.text
        : event.params.exceptionDetails?.text || (event.params.args || []).map((a) => a.value ?? a.description).join(" "))
      .filter((text) => text && !/favicon|401|403/.test(text));
  }
}


/* ---------- HTTP-level logo upload / replace cycle ---------- */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAKUlEQVR42u3OMQ0AAAgDsIn+aY8GDiQ4VWTSzGxmZi4zMzMzMzMzMzPzYwH+AQHKA8n8AAAAAElFTkSuQmCC",
  "base64"
);

async function loadService() {
  const response = await fetch(BASE + "/api/services?profile=1");
  if (!response.ok) return null;
  const body = await response.json();
  const list = body.services || body.items || body || [];
  return list.find((item) => item && item.id) || null;
}

async function uploadLogo(name, service) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(PNG)], { type: "image/png" }), name);
  form.append("scope", "service");
  form.append("serviceId", String(service.id));
  form.append("profileId", "1");
  const response = await fetch(BASE + "/api/assets", { method: "POST", body: form });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function updateServiceLogo(service, logoKey) {
  const response = await fetch(`${BASE}/api/services?id=${service.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...service, logoKey }),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function headAsset(key) {
  const response = await fetch(`${BASE}/api/assets?key=${encodeURIComponent(key)}`);
  return { status: response.status, headers: response.headers };
}

const serverAlreadyUp = await fetch(BASE + "/").then((response) => response.ok).catch(() => false);
const server = serverAlreadyUp ? null : spawn("npm.cmd", ["run", "dev"], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], shell: true, env: { ...process.env, CI: "1" } });
if (server) {
  server.stdout.pipe(log);
  server.stderr.pipe(log);
}

let chrome;
let cdp;
const cleanup = async () => {
  try { cdp?.ws.close(); } catch {}
  try { spawnSync("taskkill", ["/pid", String(chrome?.pid || 0), "/T", "/F"], { stdio: "ignore" }); } catch {}
  if (server) {
    try { spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
  }
  // Chrome keeps its profile locked until it exits, so remove it afterwards.
  await sleep(1200);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
};
try {
  if (!(await waitForServer())) throw new Error("dev server never answered on " + BASE);

  const service = await loadService();
  check("a seeded service is available", Boolean(service), service ? service.name : "none");
  if (service) {
    const uploaded = await uploadLogo("anchor-test-logo.png", service);
    check("upload returns 201 and a key", uploaded.status === 201 && typeof uploaded.body.key === "string", JSON.stringify(uploaded.body).slice(0, 120));
    var firstKey = uploaded.body.key;
    const assigned = await updateServiceLogo(service, firstKey);
    check("service accepts the logo key", assigned.status === 200 && assigned.body.logoKey === firstKey, "status " + assigned.status);
    const served = await headAsset(firstKey);
    check("asset is served immutable", served.status === 200 && served.headers.get("cache-control") === "private, max-age=2592000, immutable", served.headers.get("cache-control") || "");
  }

  chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=" + CDP_PORT, "--user-data-dir=" + profile, "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars", "--window-size=1440,1000", "about:blank"], { stdio: "ignore" });

  let wsUrl = "";
  for (let i = 0; i < 40 && !wsUrl; i++) {
    await sleep(500);
    try {
      const list = await (await fetch("http://127.0.0.1:" + CDP_PORT + "/json/list")).json();
      wsUrl = (list.find((target) => target.type === "page") || {}).webSocketDebuggerUrl || "";
    } catch {}
  }
  if (!wsUrl) throw new Error("Chrome DevTools endpoint never came up");
  cdp = new Cdp(wsUrl);
  await cdp.ready;
  for (const method of ["Page.enable", "Runtime.enable", "Log.enable", "Network.enable"]) await cdp.send(method);

  const assetRequests = () => cdp.events.filter((event) => event.method === "Network.requestWillBeSent" && event.params.request.url.includes("/api/assets")).length;
  const keyedRequests = () => cdp.events.filter((event) => event.method === "Network.requestWillBeSent" && event.params.request.url.includes("/api/assets?key=")).length;

  await cdp.send("Page.navigate", { url: BASE + "/" });
  check("home renders", await cdp.waitFor("document.getElementById('heading') && document.getElementById('heading').textContent.trim().length > 3"));
  await sleep(600);
  const brand = await cdp.evaluate("document.getElementById('brandName').textContent + ' / ' + document.getElementById('brandSubtitle').textContent");
  check("branding renders Anchor Dashboard", brand === "Anchor / Dashboard", brand);
  check("no horizontal overflow on Home", await cdp.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"));
  await cdp.shot("01-home");

  await cdp.evaluate("document.querySelector('[data-page=all]').click()");
  await cdp.waitFor("document.querySelectorAll('[data-asset-key]').length > 0", 8000);
  await sleep(1500);
  check("logo markup opted into the asset cache", (await cdp.evaluate("document.querySelectorAll('[data-asset-key]').length")) > 0);
  const assetUrls = cdp.events.filter((event) => event.method === "Network.requestWillBeSent" && event.params.request.url.includes("/api/assets?key=")).map((event) => decodeURIComponent(event.params.request.url.replace(BASE, "")));
  check("cold load fetched the logo", assetUrls.length > 0, assetUrls.join(" | "));
  check("logo paints from a cached source", await cdp.evaluate("(()=>{const img=document.querySelector('img[data-asset-key]');return !!img && !img.hidden && (img.src.startsWith('blob:') || img.src.includes('/api/assets'))})()"));
  await cdp.shot("02-all-services");

  const beforeReload = keyedRequests();
  await cdp.send("Page.navigate", { url: BASE + "/" });
  await cdp.waitFor("document.getElementById('heading')", 8000);
  await cdp.evaluate("document.querySelector('[data-page=all]').click()");
  await cdp.waitFor("document.querySelectorAll('[data-asset-key]').length > 0", 8000);
  await sleep(1800);
  const afterReload = keyedRequests();
  check("reload served logos from Cache Storage", afterReload === beforeReload, (afterReload - beforeReload) + " extra keyed asset requests");

  await cdp.evaluate("(()=>{const s=document.getElementById('search');s.value='clo';s.dispatchEvent(new Event('input',{bubbles:true}))})()");
  check("quick results open on typing", await cdp.waitFor("!document.getElementById('quickResults').hidden && document.querySelectorAll('#quickResults button').length > 0", 5000));
  check("search box reports expanded", (await cdp.evaluate("document.getElementById('search').getAttribute('aria-expanded')")) === "true");
  await cdp.shot("02-quick-results");
  await cdp.evaluate("document.getElementById('search').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))");
  check("arrow keys move the quick selection", await cdp.waitFor("document.querySelectorAll('#quickResults [aria-selected=true]').length === 1", 3000));
  await cdp.evaluate("document.getElementById('search').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  check("escape closes quick results", await cdp.waitFor("document.getElementById('quickResults').hidden", 3000));

  await cdp.evaluate("document.querySelector('[data-page=all]').click()");
  await cdp.waitFor("document.getElementById('heading').textContent.includes('All services')", 5000);
  await cdp.evaluate("(()=>{const g=document.getElementById('groupBySetting');g.value='category';g.dispatchEvent(new Event('change',{bubbles:true}))})()");
  check("category grouping renders groups", await cdp.waitFor("document.querySelectorAll('.catalog-group').length > 1", 5000), (await cdp.evaluate("document.querySelectorAll('.catalog-group').length")) + " groups");
  check("group headers carry names and counts", (await cdp.evaluate("document.querySelectorAll('.catalog-group-head h2').length")) > 0 && (await cdp.evaluate("document.querySelectorAll('.catalog-group-count').length")) > 0);
  await cdp.shot("03-grouped");
  await cdp.evaluate("(()=>{const g=document.getElementById('groupBySetting');g.value='none';g.dispatchEvent(new Event('change',{bubbles:true}))})()");

  await cdp.evaluate("document.getElementById('settingsNav').click()");
  check("settings renders", await cdp.waitFor("!!document.getElementById('settingsIdentity')", 6000));
  const order = await cdp.evaluate("[...document.querySelectorAll('.settings-card[id]')].map(card=>card.id)");
  check("settings cards are grouped in order", order.indexOf("settingsIdentity") === 0 && order.indexOf("settingsAbout") === order.length - 1, order.join(" > "));
  const jumpCount = await cdp.evaluate("document.querySelectorAll('.settings-jump a, .settings-jump button').length");
  check("section jump nav is populated", jumpCount >= 5, jumpCount + " targets");
  const sticky = await cdp.evaluate("(()=>{const bar=document.getElementById('settingsSavebar');return bar ? getComputedStyle(bar).position : ''})()");
  check("save bar sticks to the viewport", sticky === "sticky" || sticky === "fixed", sticky);
  check("no horizontal overflow on Settings", await cdp.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"));
  const heights = await cdp.evaluate("[...document.querySelectorAll('.settings-card[id]')].map(card=>Math.round(card.getBoundingClientRect().height))");
  check("every settings card has real height", heights.every((height) => height > 40), heights.join("/"));
  await cdp.shot("04-settings");

  await cdp.evaluate("(()=>{const box=document.getElementById('showCardDescriptionsSetting');if(box){box.checked=!box.checked;box.dispatchEvent(new Event('change',{bubbles:true}))}})()");
  check("editing preferences flips the save bar to unsaved", await cdp.waitFor("/unsaved/i.test(document.getElementById('settingsSaveState').textContent)", 4000), await cdp.evaluate("document.getElementById('settingsSaveState') ? document.getElementById('settingsSaveState').textContent : ''"));

  if (service) {
    const replacement = await uploadLogo("anchor-test-logo-2.png", service);
    const secondKey = replacement.body.key;
    const reassigned = await updateServiceLogo(service, secondKey);
    check("service accepts a replacement logo", reassigned.status === 200 && reassigned.body.logoKey === secondKey);
    const oldAfter = await headAsset(firstKey);
    check("replaced logo is gone", oldAfter.status === 404, "status " + oldAfter.status);
    check("replacement logo is served", (await headAsset(secondKey)).status === 200);
    await updateServiceLogo(service, service.logoKey || null);
    for (const key of [firstKey, secondKey]) {
      await fetch(BASE + "/api/assets?key=" + encodeURIComponent(key), { method: "DELETE" });
    }
  }

  const runtimeErrors = cdp.errors();
  check("no runtime errors in the console", runtimeErrors.length === 0, runtimeErrors.slice(0, 3).join(" | ").slice(0, 220));
} catch (error) {
  check("browser pass completed", false, String(error && error.message).slice(0, 300));
} finally {
  await cleanup();
  const failed = results.filter((entry) => !entry[1]);
  for (const [label, ok, extra] of results) console.log((ok ? "  ok   " : "  FAIL ") + label + (extra ? "  (" + extra + ")" : ""));
  console.log("browser: " + (results.length - failed.length) + "/" + results.length + " checks passed, screenshots in " + OUT);
  process.exit(failed.length ? 1 : 0);
}
