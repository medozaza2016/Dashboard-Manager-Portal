import { requireCloudflareAccess, jsonResponse } from "../lib/access.js";
import { deleteAssetIfUnreferenced, isAllowedAssetKey } from "../lib/assets.js";

const SERVICE_SELECT = `
  SELECT s.id, s.name, s.url, s.description, s.icon, s.logo_key AS logoKey, s.source_access_id AS sourceAccessId, s.is_favorite AS favorite,
         s.sort_order, s.category_sort_order AS categorySortOrder, s.category_id AS categoryId, c.name AS category,
         COALESCE(GROUP_CONCAT(t.name, char(31)), '') AS tag_list
  FROM services s
  JOIN categories c ON c.id = s.category_id
  LEFT JOIN service_tags st ON st.service_id = s.id
  LEFT JOIN tags t ON t.id = st.tag_id
`;

function normalize(row) {
  if (!row) return null;
  const { tag_list, ...service } = row;
  return { ...service, id: Number(service.id), favorite: Boolean(service.favorite), tags: tag_list ? tag_list.split("\u001f") : [] };
}

async function getService(db, id) {
  const row = await db.prepare(`${SERVICE_SELECT} WHERE s.id = ? GROUP BY s.id`).bind(id).first();
  return normalize(row);
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "Expected a JSON object.";
  if (typeof payload.name !== "string" || !payload.name.trim() || payload.name.trim().length > 100) return "Name is required and must be 100 characters or fewer.";
  if (typeof payload.url !== "string" || payload.url.length > 2048) return "A valid URL is required.";
  try {
    const url = new URL(payload.url);
    if (!["https:", "http:"].includes(url.protocol)) return "URL must use HTTP or HTTPS.";
  } catch {
    return "A valid URL is required.";
  }
  if (typeof payload.category !== "string" || !payload.category.trim() || payload.category.trim().length > 60) return "Category is required and must be 60 characters or fewer.";
  if (payload.description != null && String(payload.description).length > 500) return "Description must be 500 characters or fewer.";
  if (payload.icon != null && String(payload.icon).length > 20) return "Icon must be 20 characters or fewer.";
  if (payload.logoKey != null && payload.logoKey !== "" && !isAllowedAssetKey(payload.logoKey, "service")) return "Invalid service logo reference.";
  if (payload.tags != null && (!Array.isArray(payload.tags) || payload.tags.length > 20 || payload.tags.some((tag) => typeof tag !== "string" || tag.trim().length > 40))) return "Provide at most 20 tags, each 40 characters or fewer.";
  return null;
}

async function saveTags(db, serviceId, values, profileId) {
  await db.prepare("DELETE FROM service_tags WHERE service_id = ?").bind(serviceId).run();
  const tags = [...new Set((values || []).map((tag) => tag.trim()).filter(Boolean))];
  for (const name of tags) {
    await db.prepare("INSERT OR IGNORE INTO tags (name, profile_id) VALUES (?, ?)").bind(name, profileId).run();
    const tag = await db.prepare("SELECT id FROM tags WHERE name = ? AND profile_id = ?").bind(name, profileId).first();
    if (tag) await db.prepare("INSERT OR IGNORE INTO service_tags (service_id, tag_id) VALUES (?, ?)").bind(serviceId, tag.id).run();
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const access = await requireCloudflareAccess(request, env);
  if (access.response) return access.response;
  if (!env.DB) return jsonResponse({ error: "D1 binding DB is missing." }, 503);

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get("id");
  const id = idParam == null ? null : Number(idParam);
  if (idParam != null && (!Number.isSafeInteger(id) || id < 1)) return jsonResponse({ error: "Invalid service id." }, 400);

  const profileIdParam = searchParams.get("profile");
  const profileId = profileIdParam == null ? 1 : Number(profileIdParam);
  if (!Number.isSafeInteger(profileId) || profileId < 1 || profileId > 2) {
    return jsonResponse({ error: "Invalid profile. Use profile=1 (Personal) or profile=2 (Work)." }, 400);
  }

  if (request.method === "GET") {
    if (id != null) {
      const row = await env.DB.prepare(`${SERVICE_SELECT} WHERE s.id = ? AND s.profile_id = ? GROUP BY s.id`).bind(id, profileId).first();
      return row ? jsonResponse(normalize(row)) : jsonResponse({ error: "Service not found in this profile." }, 404);
    }

    const query = SERVICE_SELECT + " WHERE s.profile_id = ? GROUP BY s.id ORDER BY s.sort_order, s.id";
    const result = await env.DB.prepare(query).bind(profileId).all();
    return jsonResponse((result.results || []).map(normalize));
  }

  if (request.method === "PATCH" && id == null) {
    let payload;
    try { payload = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON body." }, 400); }
    if (!payload || !Array.isArray(payload.order) || payload.order.length > 200 ||
        payload.order.some(value => !Number.isSafeInteger(Number(value)) || Number(value) < 1) ||
        new Set(payload.order.map(Number)).size !== payload.order.length) {
      return jsonResponse({ error: "Provide an ordered array of unique service IDs." }, 400);
    }

    const scope = payload.scope === "category" ? "category" : "global";
    const categoryId = scope === "category" ? Number(payload.categoryId) : null;
    if (scope === "category" && (!Number.isSafeInteger(categoryId) || categoryId < 1)) {
      return jsonResponse({ error: "A valid categoryId is required for category ordering." }, 400);
    }
    if (scope === "category") {
      const category = await env.DB.prepare("SELECT id FROM categories WHERE id = ? AND profile_id = ?").bind(categoryId, profileId).first();
      if (!category) return jsonResponse({ error: "Category not found in this profile." }, 404);
    }

    const current = scope === "category"
      ? await env.DB.prepare("SELECT id FROM services WHERE profile_id = ? AND category_id = ?").bind(profileId, categoryId).all()
      : await env.DB.prepare("SELECT id FROM services WHERE profile_id = ?").bind(profileId).all();
    const existingIds = (current.results || []).map(row => Number(row.id));
    const requestedIds = payload.order.map(Number);
    if (existingIds.length !== requestedIds.length || existingIds.some(serviceId => !requestedIds.includes(serviceId))) {
      return jsonResponse({
        error: scope === "category"
          ? "The category service list changed. Refresh and try reordering again."
          : "The service list changed. Refresh and try reordering again."
      }, 409);
    }

    const statements = requestedIds.map((serviceId, index) => scope === "category"
      ? env.DB.prepare("UPDATE services SET category_sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND profile_id = ? AND category_id = ?")
          .bind(index + 1, serviceId, profileId, categoryId)
      : env.DB.prepare("UPDATE services SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND profile_id = ?")
          .bind(index + 1, serviceId, profileId));
    if (statements.length) await env.DB.batch(statements);

    const result = scope === "category"
      ? await env.DB.prepare(`${SERVICE_SELECT} WHERE s.profile_id = ? AND s.category_id = ? GROUP BY s.id ORDER BY s.category_sort_order, s.id`).bind(profileId, categoryId).all()
      : await env.DB.prepare(`${SERVICE_SELECT} WHERE s.profile_id = ? GROUP BY s.id ORDER BY s.sort_order, s.id`).bind(profileId).all();
    return jsonResponse((result.results || []).map(normalize));
  }

  if (request.method === "POST" || request.method === "PUT") {
    let payload;
    try { payload = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON body." }, 400); }
    const validationError = validatePayload(payload);
    if (validationError) return jsonResponse({ error: validationError }, 400);

    const categoryName = payload.category.trim();
    await env.DB.prepare("INSERT OR IGNORE INTO categories (name, sort_order, icon, profile_id) VALUES (?, 999, 'grid', ?)").bind(categoryName, profileId || 1).run();
    const category = await env.DB.prepare("SELECT id FROM categories WHERE name = ? AND profile_id = ?").bind(categoryName, profileId || 1).first();
    if (!category) return jsonResponse({ error: "Could not resolve service category." }, 500);

    const fields = [
      payload.name.trim(),
      payload.url.trim(),
      String(payload.description || "").trim(),
      String(payload.icon || "🔧").trim(),
      payload.logoKey || null,
      category.id,
      payload.favorite ? 1 : 0,
      profileId || 1,
    ];

    let serviceId = id;
    if (request.method === "POST") {
      const [sort, categorySort] = await Promise.all([
        env.DB.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort FROM services WHERE profile_id = ?").bind(profileId).first(),
        env.DB.prepare("SELECT COALESCE(MAX(category_sort_order), 0) + 1 AS next_sort FROM services WHERE profile_id = ? AND category_id = ?").bind(profileId, category.id).first(),
      ]);
      const inserted = await env.DB.prepare(
        "INSERT INTO services (name, url, description, icon, logo_key, category_id, is_favorite, sort_order, profile_id, category_sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(...fields, Number(sort?.next_sort || 1), Number(categorySort?.next_sort || 1)).run();
      serviceId = Number(inserted.meta?.last_row_id);
    } else {
      if (serviceId == null) return jsonResponse({ error: "The id query parameter is required for updates." }, 400);
      const existing = await env.DB.prepare("SELECT id, logo_key, category_id, category_sort_order FROM services WHERE id = ? AND profile_id = ?").bind(serviceId, profileId).first();
      if (!existing) return jsonResponse({ error: "Service not found." }, 404);
      const categoryOrder = Number(existing.category_id) === Number(category.id)
        ? Number(existing.category_sort_order || 1)
        : Number((await env.DB.prepare("SELECT COALESCE(MAX(category_sort_order), 0) + 1 AS next_sort FROM services WHERE profile_id = ? AND category_id = ?").bind(profileId, category.id).first())?.next_sort || 1);
      await env.DB.prepare(
        "UPDATE services SET name = ?, url = ?, description = ?, icon = ?, logo_key = ?, category_id = ?, is_favorite = ?, category_sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND profile_id = ?"
      ).bind(...fields.slice(0, -1), categoryOrder, serviceId, profileId).run();
      if (existing.logo_key && existing.logo_key !== (payload.logoKey || null)) await deleteAssetIfUnreferenced(env, existing.logo_key);
    }

    await saveTags(env.DB, serviceId, payload.tags, profileId);
    return jsonResponse(await getService(env.DB, serviceId), request.method === "POST" ? 201 : 200);
  }

  if (request.method === "DELETE") {
    if (id == null) return jsonResponse({ error: "The id query parameter is required for deletion." }, 400);
    const existing = await env.DB.prepare("SELECT id, logo_key FROM services WHERE id = ? AND profile_id = ?").bind(id, profileId).first();
    if (!existing) return jsonResponse({ error: "Service not found in this profile." }, 404);
    await env.DB.prepare("DELETE FROM service_tags WHERE service_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM services WHERE id = ? AND profile_id = ?").bind(id, profileId).run();
    if (existing.logo_key) await deleteAssetIfUnreferenced(env, existing.logo_key);
    return jsonResponse({ deleted: true, id });
  }

  return jsonResponse({ error: "Method not allowed." }, 405);
}
