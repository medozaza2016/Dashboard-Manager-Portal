/* Anchor Dashboard - browser-side cache for private R2 logo assets.

   Every logo is an authenticated Pages Function call plus an R2 read, which is
   the expensive part of the free tier. The backend now caches at the edge; this
   module makes sure a repeat visit never leaves the device at all:

   1. Cache Storage (`anchor-assets-v1`) keeps the bytes across reloads and
      offline visits.
   2. Resolved blobs are turned into object URLs once per session, so re-rendering
      the catalog does not re-decode images.
   3. Concurrent requests for the same key are de-duplicated.

   Markup opts in with `data-asset-key="<r2 key>"` and no `src`, then
   `hydrateAssetImages()` fills the source after the DOM is updated. */
import { assetUrl } from "../core/asset-url.js";

const CACHE_NAME = "anchor-assets-v1";
const FAILURE_TTL_MS = 60 * 1000;
const errorHandlers = new WeakMap();
const objectUrls = new Map();
const inflight = new Map();
const failures = new Map();

function cacheStorage() {
  return typeof caches === "undefined" ? null : caches;
}

async function openAssetCache() {
  const storage = cacheStorage();
  if (!storage) return null;
  try {
    return await storage.open(CACHE_NAME);
  } catch {
    return null;
  }
}

function showIconFallback(node) {
  const fallback = node.previousElementSibling;
  if (fallback && fallback.classList && fallback.classList.contains("icon-fallback")) fallback.style.display = "grid";
  const fallbackId = node.dataset.assetFallback;
  const target = fallbackId ? document.getElementById(fallbackId) : null;
  if (target) target.hidden = false;
}

async function cachedAssetUrl(key) {
  if (!key) throw new Error("Missing asset key");
  const ready = objectUrls.get(key);
  if (ready) return ready;
  const pending = inflight.get(key);
  if (pending) return pending;
  const failedAt = failures.get(key);
  if (failedAt && Date.now() - failedAt < FAILURE_TTL_MS) throw new Error("Asset is temporarily unavailable");

  const task = (async () => {
    const url = assetUrl(key);
    const store = await openAssetCache();
    let response = store ? await store.match(url).catch(() => null) : null;
    if (!response) {
      response = await fetch(url, { credentials: "same-origin", cache: "force-cache" });
      if (!response.ok) throw new Error("Asset unavailable (" + response.status + ")");
      // Cache first so a later re-render never asks the network again.
      if (store) {
        try {
          await store.put(url, response.clone());
        } catch {}
      }
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    objectUrls.set(key, objectUrl);
    failures.delete(key);
    return objectUrl;
  })();

  inflight.set(key, task);
  try {
    return await task;
  } catch (error) {
    failures.set(key, Date.now());
    throw error;
  } finally {
    inflight.delete(key);
  }
}

async function hydrateAssetImage(node) {
  const key = node.dataset.assetKey;
  if (!key || node.dataset.assetBound === key) return;
  node.dataset.assetBound = key;
  try {
    const url = await cachedAssetUrl(key);
    if (node.dataset.assetKey !== key) return;
    node.src = url;
    node.hidden = false;
    node.classList.remove("asset-missing");
  } catch {
    node.hidden = true;
    node.classList.add("asset-missing");
    showIconFallback(node);
    const onError = errorHandlers.get(node);
    if (typeof onError === "function") onError(node);
  }
}

function hydrateAssetImages(root = document) {
  const nodes = root && typeof root.querySelectorAll === "function" ? [...root.querySelectorAll("img[data-asset-key]")] : [];
  for (const node of nodes) void hydrateAssetImage(node);
  return nodes.length;
}

/* Point an <img> at either a direct source (blob preview, remote icon) or a
   cached R2 key. Passing a key never touches the network until the cache module
   resolves it. */
function setImageSource(node, source, key = null, onError = null) {
  if (!node) return;
  if (typeof onError === "function") errorHandlers.set(node, onError);
  else errorHandlers.delete(node);
  if (key) {
    if (node.dataset.assetKey !== key) {
      delete node.dataset.assetBound;
      node.dataset.assetKey = key;
      node.removeAttribute("src");
      node.hidden = true;
    }
    void hydrateAssetImage(node);
    return;
  }
  delete node.dataset.assetKey;
  delete node.dataset.assetBound;
  node.classList.remove("asset-missing");
  const fallbackId = node.dataset.assetFallback;
  const fallback = fallbackId ? document.getElementById(fallbackId) : null;
  if (fallback) fallback.hidden = true;
  if (source) {
    node.src = source;
    node.hidden = false;
  } else {
    node.removeAttribute("src");
    node.hidden = true;
  }
}

async function forgetAsset(key) {
  if (!key) return;
  const url = objectUrls.get(key);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrls.delete(key);
  }
  inflight.delete(key);
  failures.delete(key);
  const store = await openAssetCache();
  if (store) {
    try {
      await store.delete(assetUrl(key));
    } catch {}
  }
}

async function assetCacheStats() {
  const store = await openAssetCache();
  if (!store) return { supported: false, count: 0, bytes: 0 };
  let count = 0;
  let bytes = 0;
  try {
    for (const request of await store.keys()) {
      const response = await store.match(request);
      if (!response) continue;
      count++;
      bytes += Number(response.headers.get("content-length") || 0);
    }
  } catch {}
  return { supported: true, count, bytes };
}

async function clearAssetCache() {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();
  inflight.clear();
  failures.clear();
  const storage = cacheStorage();
  if (storage) {
    try {
      await storage.delete(CACHE_NAME);
    } catch {}
  }
  return true;
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return value + " B";
  if (value < 1024 * 1024) return (value / 1024).toFixed(value < 10 * 1024 ? 1 : 0) + " KB";
  return (value / (1024 * 1024)).toFixed(1) + " MB";
}

export { CACHE_NAME, cachedAssetUrl, hydrateAssetImage, hydrateAssetImages, setImageSource, forgetAsset, assetCacheStats, clearAssetCache, formatBytes };
