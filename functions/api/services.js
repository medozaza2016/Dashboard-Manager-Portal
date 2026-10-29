import { requireCloudflareAccess, jsonResponse } from "../lib/access.js";

const SERVICE_SELECT = `
  SELECT s.id, s.name, s.url, s.description, s.icon, s.is_favorite AS favorite,
         s.sort_order, c.name AS category,
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
  if (payload.tags != null && (!Array.isArray(payload.tags) || payload.tags.length > 20 || payload.tags.some((tag) => typeof tag !== "string" || tag.trim().length > 40))) return "Provide at most 20 tags, each 40 characters or fewer.";
  return null;
}

async function saveTags(db, serviceId, values) {
  await db.prepare("DELETE FROM service_tags WHERE service_id = ?").bind(serviceId).run();
  const tags = [...new Set((values || []).map((tag) => tag.trim()).filter(Boolean))];
  for (const name of tags) {
    await db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").bind(name).run();
    const tag = await db.prepare("SELECT id FROM tags WHERE name = ?").bind(name).first();
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

  if (request.method === "GET") {
    if (id != null) {
      const service = await getService(env.DB, id);
      return service ? jsonResponse(service) : jsonResponse({ error: "Service not found." }, 404);
    }
    const result = await env.DB.prepare(`${SERVICE_SELECT} GROUP BY s.id ORDER BY s.sort_order, s.id`).all();
    return jsonResponse((result.results || []).map(normalize));
  }

  if (request.method === "POST" || request.method === "PUT") {
    let payload;
    try { payload = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON body." }, 400); }
    const validationError = validatePayload(payload);
    if (validationError) return jsonResponse({ error: validationError }, 400);

    const categoryName = payload.category.trim();
    await env.DB.prepare("INSERT OR IGNORE INTO categories (name, sort_order, icon) VALUES (?, 999, 'grid')").bind(categoryName).run();
    const category = await env.DB.prepare("SELECT id FROM categories WHERE name = ?").bind(categoryName).first();
    if (!category) return jsonResponse({ error: "Could not resolve service category." }, 500);

    const fields = [
      payload.name.trim(),
      payload.url.trim(),
      String(payload.description || "").trim(),
      String(payload.icon || "🔧").trim(),
      category.id,
      payload.favorite ? 1 : 0,
    ];

    let serviceId = id;
    if (request.method === "POST") {
      const sort = await env.DB.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort FROM services").first();
      const inserted = await env.DB.prepare(
        "INSERT INTO services (name, url, description, icon, category_id, is_favorite, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(...fields, Number(sort?.next_sort || 1)).run();
      serviceId = Number(inserted.meta?.last_row_id);
    } else {
      if (serviceId == null) return jsonResponse({ error: "The id query parameter is required for updates." }, 400);
      const existing = await env.DB.prepare("SELECT id FROM services WHERE id = ?").bind(serviceId).first();
      if (!existing) return jsonResponse({ error: "Service not found." }, 404);
      await env.DB.prepare(
        "UPDATE services SET name = ?, url = ?, description = ?, icon = ?, category_id = ?, is_favorite = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(...fields, serviceId).run();
    }

    await saveTags(env.DB, serviceId, payload.tags);
    return jsonResponse(await getService(env.DB, serviceId), request.method === "POST" ? 201 : 200);
  }

  if (request.method === "DELETE") {
    if (id == null) return jsonResponse({ error: "The id query parameter is required for deletion." }, 400);
    const existing = await env.DB.prepare("SELECT id FROM services WHERE id = ?").bind(id).first();
    if (!existing) return jsonResponse({ error: "Service not found." }, 404);
    await env.DB.prepare("DELETE FROM service_tags WHERE service_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM services WHERE id = ?").bind(id).run();
    return jsonResponse({ deleted: true, id });
  }

  return jsonResponse({ error: "Method not allowed." }, 405);
}
