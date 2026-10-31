/* Anchor Dashboard - local "most used" tracking.

   The portal has no analytics backend, so usage is counted on the device and
   stored next to the existing cache keys. Opening a service is the only event
   tracked; the counters feed the Home "Most used" strip, the "Most used" sort,
   and the ranking bonus inside global search. */
import { state } from "../state.js";

const STORAGE_KEY = "anchor-usage-v1";
const MAX_ENTRIES = 300;
const MAX_COUNT = 9999;

let store = readStore();

function readStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (raw && typeof raw === "object") {
      if (!raw.profiles || typeof raw.profiles !== "object") raw.profiles = {};
      return raw;
    }
  } catch {}
  return { version: 1, profiles: {} };
}

function saveStore() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

function profileBucket(profileId = state.currentProfile, create = false) {
  const id = String(profileId == null ? 1 : profileId);
  if (!store.profiles || typeof store.profiles !== "object") store.profiles = {};
  let bucket = store.profiles[id];
  if (!bucket || typeof bucket !== "object") {
    if (!create) return {};
    bucket = {};
    store.profiles[id] = bucket;
  }
  if (create) prune(bucket);
  return bucket;
}

function prune(bucket) {
  const entries = Object.entries(bucket);
  if (entries.length <= MAX_ENTRIES) return;
  entries
    .sort((a, b) => (Number(b[1]?.lastUsedAt) || 0) - (Number(a[1]?.lastUsedAt) || 0))
    .slice(MAX_ENTRIES)
    .forEach(([id]) => delete bucket[id]);
}

function recordServiceUse(service, profileId = state.currentProfile) {
  if (!service || service.id == null) return null;
  const bucket = profileBucket(profileId, true);
  const id = String(service.id);
  const previous = bucket[id] || { count: 0, lastUsedAt: 0 };
  const entry = {
    count: Math.min(MAX_COUNT, (Number(previous.count) || 0) + 1),
    lastUsedAt: Date.now(),
    name: String(service.name || "").slice(0, 120),
  };
  bucket[id] = entry;
  saveStore();
  return entry;
}

function usageFor(serviceId, profileId = state.currentProfile) {
  const bucket = profileBucket(profileId);
  const entry = bucket[String(serviceId)];
  return entry ? { count: Number(entry.count) || 0, lastUsedAt: Number(entry.lastUsedAt) || 0 } : { count: 0, lastUsedAt: 0 };
}

function rankedServices(profileId = state.currentProfile) {
  const bucket = profileBucket(profileId);
  const byId = new Map();
  for (const service of state.services) {
    const entry = bucket[String(service.id)];
    const count = Number(entry?.count) || 0;
    if (!count) continue;
    byId.set(String(service.id), { service, count, lastUsedAt: Number(entry?.lastUsedAt) || 0 });
  }
  return [...byId.values()];
}

function mostUsedServices(limit = 6, profileId = state.currentProfile) {
  return rankedServices(profileId)
    .sort((a, b) => b.count - a.count || b.lastUsedAt - a.lastUsedAt || String(a.service.name).localeCompare(String(b.service.name)))
    .slice(0, Math.max(0, limit));
}

function recentlyUsedServices(limit = 5, profileId = state.currentProfile) {
  return rankedServices(profileId)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt || b.count - a.count)
    .slice(0, Math.max(0, limit));
}

function usageSummary(profileId = state.currentProfile) {
  const ranked = rankedServices(profileId);
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return {
    tracked: ranked.length,
    opens: ranked.reduce((total, entry) => total + entry.count, 0),
    thisWeek: ranked.filter((entry) => entry.lastUsedAt >= weekAgo).length,
  };
}

function clearUsage(profileId = state.currentProfile) {
  const id = String(profileId == null ? 1 : profileId);
  if (store.profiles && store.profiles[id]) delete store.profiles[id];
  saveStore();
}

export { STORAGE_KEY, recordServiceUse, usageFor, mostUsedServices, recentlyUsedServices, usageSummary, clearUsage };
