import { requireCloudflareAccess, jsonResponse } from "../lib/access.js";
import { deleteAssetIfUnreferenced, isAllowedAssetKey } from "../lib/assets.js";

const DEFAULTS = {
  branding: { name: "Luxorit", subtitle: "Pro", logo: "", logoKey: null },
  preferences: { theme: "dark", landingPage: "home", defaultView: "list", sidebarCollapsed: false, showSlimDescriptions: false },
};
const MAX_SERVICES = 200;
const MAX_TAGS = 300;
const MAX_TAG_LINKS = 500;

function normalizeService(row) {
  const { tag_list, ...service } = row;
  return {
    ...service,
    id: Number(service.id),
    favorite: Boolean(service.favorite),
    tags: tag_list ? tag_list.split("\u001f") : [],
  };
}

function cleanBranding(value = {}) {
  return {
    name: typeof value.name === "string" ? value.name.trim().slice(0, 42) || "Luxorit" : "Luxorit",
    subtitle: typeof value.subtitle === "string" ? value.subtitle.trim().slice(0, 32) : "",
    logo: typeof value.logo === "string" ? value.logo.trim().slice(0, 4) : "",
    logoKey: isAllowedAssetKey(value.logoKey, "branding") ? value.logoKey : null,
  };
}

function cleanPreferences(value = {}, legacyTheme) {
  return {
    theme: value.theme === "light" || (!value.theme && legacyTheme === "light") ? "light" : "dark",
    landingPage: ["home", "all"].includes(value.landingPage) ? value.landingPage : "home",
    defaultView: ["list", "cards", "slim"].includes(value.defaultView) ? value.defaultView : "list",
    sidebarCollapsed: Boolean(value.sidebarCollapsed),
    showSlimDescriptions: Boolean(value.showSlimDescriptions),
  };
}

async function readSetting(db, key, fallback) {
  const row = await db.prepare("SELECT setting_value FROM portal_settings WHERE setting_key = ?").bind(key).first();
  if (!row) return fallback;
  try { return JSON.parse(row.setting_value); } catch { return fallback; }
}

function validateAndNormalize(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { error: "Expected a backup JSON object." };
  if (!Array.isArray(payload.services)) return { error: "Backup must contain a services array." };
  if (payload.services.length > MAX_SERVICES) return { error: `Backups can contain at most ${MAX_SERVICES} services.` };

  const incomingCategories = Array.isArray(payload.categories) ? payload.categories : [];
  const categories = new Map();
  for (const item of incomingCategories) {
    if (!item || typeof item.name !== "string") return { error: "Each category must have a name." };
    const name = item.name.trim();
    if (!name || name.length > 60) return { error: "Category names must contain 1 to 60 characters." };
    if (!categories.has(name)) categories.set(name, { name, icon: typeof item.icon === "string" ? item.icon.slice(0, 20) : "grid", sort_order: Number.isSafeInteger(Number(item.sort_order)) ? Number(item.sort_order) : categories.size + 1 });
    if (categories.size > 50) return { error: "Backups can contain at most 50 categories." };
  }

  const usedServiceIds = new Set();
  let nextId = Math.max(0, ...payload.services.map((s) => Number.isSafeInteger(Number(s?.id)) && Number(s.id) > 0 ? Number(s.id) : 0)) + 1;
  const services = [];
  const tagNames = new Set();
  let tagLinks = 0;

  for (const raw of payload.services) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "Each service must be a JSON object." };
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name || name.length > 100) return { error: "Each service needs a name of at most 100 characters." };
    const urlText = typeof raw.url === "string" ? raw.url.trim() : "";
    try {
      const url = new URL(urlText);
      if (!["http:", "https:"].includes(url.protocol)) return { error: `Service "${name}" must use an HTTP or HTTPS URL.` };
    } catch {
      return { error: `Service "${name}" has an invalid URL.` };
    }
    const category = typeof raw.category === "string" ? raw.category.trim() : "";
    if (!category || category.length > 60) return { error: `Service "${name}" needs a category of at most 60 characters.` };
    if (raw.description != null && String(raw.description).length > 500) return { error: `Description for "${name}" exceeds 500 characters.` };
    if (raw.icon != null && String(raw.icon).length > 20) return { error: `Icon for "${name}" exceeds 20 characters.` };
    if (raw.logoKey != null && raw.logoKey !== "" && !isAllowedAssetKey(raw.logoKey, "service")) return { error: `Logo reference for "${name}" is invalid.` };
    if (raw.tags != null && (!Array.isArray(raw.tags) || raw.tags.length > 20 || raw.tags.some((tag) => typeof tag !== "string" || tag.trim().length > 40))) {
      return { error: `Tags for "${name}" must be up to 20 strings of at most 40 characters each.` };
    }

    let id = Number(raw.id);
    if (!Number.isSafeInteger(id) || id < 1 || usedServiceIds.has(id)) {
      while (usedServiceIds.has(nextId)) nextId += 1;
      id = nextId++;
    }
    usedServiceIds.add(id);

    const tags = [...new Set((raw.tags || []).map((tag) => tag.trim()).filter(Boolean))];
    tagLinks += tags.length;
    if (tagLinks > MAX_TAG_LINKS) return { error: `Backups can contain at most ${MAX_TAG_LINKS} service-tag links.` };
    for (const tag of tags) tagNames.add(tag);
    if (!categories.has(category)) categories.set(category, { name: category, icon: "grid", sort_order: categories.size + 1 });

    services.push({
      id,
      name,
      url: urlText,
      description: String(raw.description || "").trim(),
      icon: String(raw.icon || "🔧").trim(),
      logoKey: isAllowedAssetKey(raw.logoKey, "service") ? raw.logoKey : null,
      sourceAccessId: typeof raw.sourceAccessId === "string" && raw.sourceAccessId.length <= 64 ? raw.sourceAccessId : null,
      category,
      favorite: Boolean(raw.favorite),
      sort_order: Number.isSafeInteger(Number(raw.sort_order)) ? Number(raw.sort_order) : services.length + 1,
      tags,
    });
  }
  if (categories.size > 50) return { error: "Backups can contain at most 50 categories." };
  if (tagNames.size > MAX_TAGS) return { error: `Backups can contain at most ${MAX_TAGS} unique tags.` };

  const categoryRows = [...categories.values()].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((category, index) => ({ ...category, id: index + 1 }));

  return {
    backup: {
      services,
      categories: categoryRows,
      tags: [...tagNames],
      branding: cleanBranding(payload.branding || {}),
      preferences: cleanPreferences(payload.preferences || {}, payload.theme),
    },
  };
}

async function exportBackup(db) {
  const [servicesResult, categoriesResult, branding, preferences] = await Promise.all([
    db.prepare(`
      SELECT s.id, s.name, s.url, s.description, s.icon, s.logo_key AS logoKey, s.source_access_id AS sourceAccessId, s.is_favorite AS favorite,
             s.sort_order, c.name AS category,
             COALESCE(GROUP_CONCAT(t.name, char(31)), '') AS tag_list
      FROM services s
      JOIN categories c ON c.id = s.category_id
      LEFT JOIN service_tags st ON st.service_id = s.id
      LEFT JOIN tags t ON t.id = st.tag_id
      GROUP BY s.id
      ORDER BY s.sort_order, s.id
    `).all(),
    db.prepare("SELECT id, name, icon, sort_order FROM categories ORDER BY sort_order, id").all(),
    readSetting(db, "branding", DEFAULTS.branding),
    readSetting(db, "preferences", DEFAULTS.preferences),
  ]);
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    source: "cloudflare-d1",
    services: (servicesResult.results || []).map(normalizeService),
    categories: categoriesResult.results || [],
    branding: cleanBranding(branding),
    preferences: cleanPreferences(preferences),
  };
}

async function restoreBackup(env, backup) {
  const db = env.DB;
  const [previousServiceLogos, previousBranding] = await Promise.all([
    db.prepare("SELECT logo_key FROM services WHERE logo_key IS NOT NULL").all(),
    readSetting(db, "branding", DEFAULTS.branding),
  ]);
  const statements = [
    db.prepare("DELETE FROM service_tags"),
    db.prepare("DELETE FROM services"),
    db.prepare("DELETE FROM tags"),
    db.prepare("DELETE FROM categories"),
  ];

  for (const category of backup.categories) {
    statements.push(db.prepare(
      "INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)"
    ).bind(category.id, category.name, category.icon || "grid", category.sort_order));
  }
  for (const tag of backup.tags) {
    statements.push(db.prepare("INSERT INTO tags (name) VALUES (?)").bind(tag));
  }
  for (const service of backup.services) {
    const category = backup.categories.find((item) => item.name === service.category);
    statements.push(db.prepare(
      "INSERT INTO services (id, name, url, description, icon, logo_key, category_id, is_favorite, sort_order, source_access_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(service.id, service.name, service.url, service.description, service.icon, service.logoKey, category.id, service.favorite ? 1 : 0, service.sort_order, service.sourceAccessId));
  }
  for (const service of backup.services) {
    for (const tag of service.tags) {
      statements.push(db.prepare(
        "INSERT OR IGNORE INTO service_tags (service_id, tag_id) SELECT ?, id FROM tags WHERE name = ?"
      ).bind(service.id, tag));
    }
  }
  for (const [key, value] of [["branding", backup.branding], ["preferences", backup.preferences]]) {
    statements.push(db.prepare(
      "INSERT INTO portal_settings (setting_key, setting_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP"
    ).bind(key, JSON.stringify(value)));
  }

  // D1 batches run as a transaction: on a statement failure, the restore is rolled back.
  await db.batch(statements);
  const previousKeys = new Set((previousServiceLogos.results || []).map((row) => row.logo_key).filter(Boolean));
  if (previousBranding?.logoKey) previousKeys.add(previousBranding.logoKey);
  for (const key of previousKeys) await deleteAssetIfUnreferenced(env, key);
}

export async function onRequest({ request, env }) {
  const access = await requireCloudflareAccess(request, env);
  if (access.response) return access.response;
  if (!env.DB) return jsonResponse({ error: "D1 binding DB is missing." }, 503);

  if (request.method === "GET") {
    return jsonResponse(await exportBackup(env.DB));
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }
  const validated = validateAndNormalize(payload);
  if (validated.error) return jsonResponse({ error: validated.error }, 400);

  try {
    await restoreBackup(env, validated.backup);
  } catch {
    return jsonResponse({ error: "Backup restore failed. The database was not changed." }, 500);
  }
  return jsonResponse({
    restored: true,
    serviceCount: validated.backup.services.length,
    categoryCount: validated.backup.categories.length,
    tagCount: validated.backup.tags.length,
  });
}
