#!/usr/bin/env node
/**
 * Asset caching regression test for `functions/api/assets.js`.
 *
 * Logos are served through an authenticated Pages Function and read from R2, so
 * every unnecessary request costs free-tier quota. This script loads the handler
 * with a stubbed D1, R2, and Cache API and asserts the caching contract:
 * long-lived immutable headers, an edge cache entry, a cache hit that skips R2,
 * 304 revalidation, and correct 404/400 failures.
 *
 * Usage: npm run check:assets
 */
import { pathToFileURL } from "node:url";

const { onRequest } = await import(pathToFileURL(process.cwd() + "/functions/api/assets.js").href);

const KEY = "service-logos/cloudflare_dash_1_11111111-1111-4111-8111-111111111111.png";
const BRANDING_KEY = "branding/22222222-2222-4222-8222-222222222222.png";
const ETAG = '"anchor-etag-1"';
const BYTES = new TextEncoder().encode("not-a-real-png");

const stored = new Map();
let r2Reads = 0;

const row = (value) => ({ first: async () => value });
const db = {
  prepare(sql) {
    if (sql.includes("portal_settings")) return row(null);
    return { bind: (key) => row(key === KEY ? { id: 1 } : null), first: async () => ({ id: 1 }) };
  },
};

const r2 = {
  async get(key, options = {}) {
    r2Reads++;
    const ifNoneMatch = options.onlyIf?.get?.("if-none-match") || "";
    if (ifNoneMatch === ETAG) return { httpEtag: ETAG, body: null, size: BYTES.length, httpMetadata: { contentType: "image/png" } };
    if (key !== KEY) return null;
    return { httpEtag: ETAG, body: new Response(BYTES).body, size: BYTES.length, httpMetadata: { contentType: "image/png" } };
  },
  async put() {},
  async delete() {},
};

globalThis.caches = {
  default: {
    async match(request) {
      const hit = stored.get(new URL(request.url).toString());
      return hit ? new Response(hit.body, { headers: hit.headers }) : undefined;
    },
    async put(request, response) {
      stored.set(new URL(request.url).toString(), { body: await response.arrayBuffer(), headers: [...response.headers] });
    },
    async delete(request) {
      return stored.delete(new URL(request.url).toString());
    },
  },
};

const env = { DB: db, R2_LOGOS: r2 };
const pending = [];
const base = "https://portal.test/api/assets";
const assetRequest = (key, init) => new Request(base + "?key=" + encodeURIComponent(key), init);
const call = async (request) => onRequest({ request, env, waitUntil: (promise) => pending.push(promise) });

const checks = [];
const check = (label, ok) => checks.push([label, Boolean(ok)]);

const metadata = await call(new Request(base));
check("metadata advertises the cache window", metadata.status === 200 && (await metadata.json()).cacheSeconds === 2592000);

const first = await call(assetRequest(KEY));
check("first read returns the image", first.status === 200);
check("browser caching is long-lived and immutable", first.headers.get("cache-control") === "private, max-age=2592000, immutable");
check("response exposes an ETag", first.headers.get("etag") === ETAG);
check("R2 was read exactly once", r2Reads === 1);

await Promise.all(pending);
const edgeEntry = stored.get(base + "?key=" + encodeURIComponent(KEY));
check("edge cache entry stored", Boolean(edgeEntry));
check("edge entry is shareable for 30 days", (edgeEntry?.headers || []).some(([name, value]) => name === "cache-control" && value.includes("s-maxage=2592000")));
check("edge entry is tagged for purge", (edgeEntry?.headers || []).some(([name, value]) => name === "cache-tag" && value === "anchor-asset"));

const second = await call(assetRequest(KEY));
check("edge cache hit skips R2", second.status === 200 && r2Reads === 1);

stored.clear();
const conditional = await call(assetRequest(KEY, { headers: { "if-none-match": ETAG } }));
check("revalidation answers 304", conditional.status === 304);
check("304 keeps the ETag", conditional.headers.get("etag") === ETAG);

const unreferenced = await call(assetRequest(BRANDING_KEY));
check("unreferenced asset is a 404", unreferenced.status === 404);

const invalid = await call(assetRequest("../etc/passwd"));
check("invalid key is rejected", invalid.status === 400);

const recached = await call(assetRequest(KEY));
check("image is cached again before delete", recached.status === 200);
await Promise.all(pending);
const removal = await call(new Request(base + "?key=" + encodeURIComponent(KEY), { method: "DELETE" }));
check("referenced image is not deleted", removal.status === 409);
const unreferencedDelete = await call(new Request(base + "?key=" + encodeURIComponent(BRANDING_KEY), { method: "DELETE" }));
check("unreferenced image is deleted", unreferencedDelete.status === 200);
check("delete evicts the edge entry", !stored.has(base + "?key=" + encodeURIComponent(BRANDING_KEY)));

// Replacing or removing a service logo goes through the shared cleanup helper,
// so it must drop the R2 object *and* the cached copy a client would still hit.
const { deleteAssetIfUnreferenced, evictAssetFromEdge } = await import(pathToFileURL(process.cwd() + "/functions/lib/assets.js").href);
const edgeEntryKey = base + "?key=" + encodeURIComponent(BRANDING_KEY);
const removedObjects = [];
const cleanupEnv = { DB: db, R2_LOGOS: { async delete(key) { removedObjects.push(key); } } };

await caches.default.put(new Request(edgeEntryKey), new Response(BYTES));
const replaced = await deleteAssetIfUnreferenced(cleanupEnv, BRANDING_KEY, "https://portal.test");
check("replacing a logo deletes the object", replaced && removedObjects.includes(BRANDING_KEY));
check("replacing a logo evicts the edge copy", !stored.has(edgeEntryKey));

const keptInUse = await deleteAssetIfUnreferenced(cleanupEnv, KEY, "https://portal.test");
check("a logo still in use is never deleted", keptInUse === false && !removedObjects.includes(KEY));

await caches.default.put(new Request(edgeEntryKey), new Response(BYTES));
check("eviction is skipped without an origin", (await evictAssetFromEdge(BRANDING_KEY, "")) === false && stored.has(edgeEntryKey));
await evictAssetFromEdge(BRANDING_KEY, "https://portal.test");

let failed = 0;
for (const [label, ok] of checks) {
  if (!ok) failed++;
  console.log((ok ? "  ok   " : "  FAIL ") + label);
}
console.log("assets: " + (checks.length - failed) + "/" + checks.length + " checks passed, " + r2Reads + " R2 reads total, " + stored.size + " edge entries left");
process.exit(failed ? 1 : 0);
