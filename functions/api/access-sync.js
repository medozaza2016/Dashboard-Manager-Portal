import { requireCloudflareAccess, jsonResponse } from "../lib/access.js";

const PROJECT_URL = "https://dashboard-manager-portal.pages.dev";
const ALLOWED_TYPES = new Set(["self_hosted", "bookmark", "saas", "dash_sso", "infrastructure"]);
const MAX_IMPORT = 100;

function normalizeDestination(app) {
  const raw = String(app.domain || app.destinations?.find((d) => d?.type === "public")?.uri || "").trim();
  if (!raw || raw.includes("*") || raw.includes("{") || raw.includes("}")) return null;
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : "https://" + raw);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
  if (url.hostname.toLowerCase() === new URL(PROJECT_URL).hostname) return null;
  return url.href;
}

function publicApp(app) {
  if (!app || typeof app.id !== "string" || typeof app.name !== "string") return null;
  if (app.app_launcher_visible !== true || !ALLOWED_TYPES.has(app.type)) return null;
  const url = normalizeDestination(app);
  if (!url) return null;
  return {
    accessId: app.id,
    name: app.name.trim().slice(0, 100),
    url,
    type: app.type,
    domain: String(app.domain || new URL(url).host).slice(0, 255),
    logoUrl: typeof app.logo_url === "string" && app.logo_url.startsWith("https://") ? app.logo_url : null,
    description: "Imported from Cloudflare Access.",
  };
}

async function loadAccessApps(env) {
  const token = env.ACCESS_SYNC_API_TOKEN;
  const accountId = env.CF_ACCOUNT_ID;
  if (!token || !accountId) {
    return { configured: false, message: "Add the read-only ACCESS_SYNC_API_TOKEN secret and CF_ACCOUNT_ID Pages variable to enable synchronization." };
  }

  const apps = [];
  for (let page = 1; page <= 10; page += 1) {
    const url = new URL("https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(accountId) + "/access/apps");
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", "100");
    let response;
    try {
      response = await fetch(url, {
        headers: {
          authorization: "Bearer " + token,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      return { error: "Could not connect to the Cloudflare Access API." };
    }

    let data;
    try { data = await response.json(); } catch { return { error: "Cloudflare Access returned an invalid response." }; }
    if (!response.ok || data?.success !== true || !Array.isArray(data.result)) {
      return { error: "Cloudflare Access API request failed. Verify the token has Access: Apps and Policies Read on this account." };
    }
    apps.push(...data.result);
    const info = data.result_info;
    if (info?.total_pages != null ? page >= Number(info.total_pages) : data.result.length < 100) break;
  }

  return { configured: true, apps: apps.map(publicApp).filter(Boolean) };
}

async function previewApps(env, db) {
  const loaded = await loadAccessApps(env);
  if (!loaded.configured) return loaded;
  if (loaded.error) return loaded;

  const result = await db.prepare("SELECT id, name, url, source_access_id FROM services").all();
  const services = result.results || [];
  const bySource = new Map(services.filter((s) => s.source_access_id).map((s) => [s.source_access_id, s]));
  const byUrl = new Map(services.map((s) => [normalizeCompareUrl(s.url), s]));
  return {
    configured: true,
    apps: loaded.apps.map((app) => {
      const existing = bySource.get(app.accessId) || byUrl.get(normalizeCompareUrl(app.url)) || null;
      return { ...app, existingServiceId: existing ? Number(existing.id) : null, existingName: existing?.name || null,
        matchType: existing ? (existing.source_access_id === app.accessId ? "source" : "url") : null };
    }),
  };
}

function normalizeCompareUrl(value) {
  try {
    const u = new URL(value);
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.origin + u.pathname + u.search;
  } catch { return String(value || "").trim().toLowerCase(); }
}

async function saveTags(db, serviceId, values) {
  await db.prepare("DELETE FROM service_tags WHERE service_id = ?").bind(serviceId).run();
  for (const name of [...new Set(values.filter(Boolean))]) {
    await db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").bind(name).run();
    const row = await db.prepare("SELECT id FROM tags WHERE name = ?").bind(name).first();
    if (row) await db.prepare("INSERT OR IGNORE INTO service_tags (service_id, tag_id) VALUES (?, ?)").bind(serviceId, row.id).run();
  }
}

async function importSelected(env, db, payload) {
  if (!payload || !Array.isArray(payload.ids) || payload.ids.length < 1 || payload.ids.length > MAX_IMPORT
    || payload.ids.some((id) => typeof id !== "string" || id.length > 64)
    || new Set(payload.ids).size !== payload.ids.length) {
    return { error: "Select between 1 and 100 unique Access applications." };
  }
  const categoryName = typeof payload.category === "string" ? payload.category.trim().slice(0, 60) : "Access Launcher";
  if (!categoryName) return { error: "Choose a category for imported applications." };

  // Re-fetch and validate the whole selection before making any database changes.
  const loaded = await loadAccessApps(env);
  if (!loaded.configured) return { error: loaded.message, setupRequired: true };
  if (loaded.error) return { error: loaded.error };
  const available = new Map(loaded.apps.map((app) => [app.accessId, app]));
  const selected = payload.ids.map((id) => available.get(id));
  if (selected.some((app) => !app)) return { error: "At least one selected application is no longer launcher-visible or is not a supported web application. Refresh the preview and try again." };

  const current = await db.prepare("SELECT id, name, url, description, source_access_id FROM services").all();
  const services = current.results || [];
  const planned = [];
  const reserved = new Set();
  for (const app of selected) {
    let existing = services.find((s) => s.source_access_id === app.accessId) || null;
    if (!existing) existing = services.find((s) => normalizeCompareUrl(s.url) === normalizeCompareUrl(app.url)) || null;
    if (existing?.source_access_id && existing.source_access_id !== app.accessId) {
      return { error: "A selected URL is already linked to a different Access application. No items were imported; refresh the preview and review the matching service." };
    }
    if (existing && reserved.has(Number(existing.id))) {
      return { error: "Two selected applications match the same service. No items were imported; import them separately after reviewing the URLs." };
    }
    if (existing) reserved.add(Number(existing.id));
    planned.push({ app, existing });
  }

  await db.prepare("INSERT OR IGNORE INTO categories (name, sort_order, icon) VALUES (?, 999, 'cloud')").bind(categoryName).run();
  const category = await db.prepare("SELECT id FROM categories WHERE name = ?").bind(categoryName).first();
  if (!category) return { error: "Could not resolve the target category." };

  const counts = { imported: 0, updated: 0, linkedExisting: 0, services: [] };
  for (const { app, existing } of planned) {
    if (existing) {
      const description = existing.source_access_id === app.accessId
        ? (existing.description === "Imported from Cloudflare Access." ? app.description : existing.description)
        : (existing.description || app.description);
      await db.prepare("UPDATE services SET name = ?, url = ?, description = ?, category_id = ?, source_access_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(app.name, app.url, description, category.id, app.accessId, existing.id).run();
      if (existing.source_access_id === app.accessId) counts.updated += 1;
      else counts.linkedExisting += 1;
      counts.services.push({ id: Number(existing.id), name: app.name, action: existing.source_access_id === app.accessId ? "updated" : "linked" });
      await saveTags(db, existing.id, ["Cloudflare Access", app.type]);
      continue;
    }

    const sort = await db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort FROM services").first();
    const inserted = await db.prepare(
      "INSERT INTO services (name, url, description, icon, category_id, is_favorite, sort_order, source_access_id) VALUES (?, ?, ?, ?, ?, 0, ?, ?)"
    ).bind(app.name, app.url, app.description, "☁️", category.id, Number(sort?.next_sort || 1), app.accessId).run();
    const serviceId = Number(inserted.meta?.last_row_id);
    await saveTags(db, serviceId, ["Cloudflare Access", app.type]);
    counts.imported += 1;
    counts.services.push({ id: serviceId, name: app.name, action: "imported" });
  }
  return counts;
}

export async function onRequest({ request, env }) {
  const access = await requireCloudflareAccess(request, env);
  if (access.response) return access.response;
  if (!env.DB) return jsonResponse({ error: "D1 binding DB is missing." }, 503);

  if (request.method === "GET") {
    const result = await previewApps(env, env.DB);
    return jsonResponse(result, result.error ? 502 : 200);
  }
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  let payload;
  try { payload = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON body." }, 400); }
  const result = await importSelected(env, env.DB, payload);
  if (result.error) return jsonResponse(result, result.message ? 503 : 400);
  return jsonResponse(result);
}
