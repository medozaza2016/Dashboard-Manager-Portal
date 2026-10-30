import { requireCloudflareAccess, jsonResponse } from "../lib/access.js";
import { deleteAssetIfUnreferenced, isAllowedAssetKey } from "../lib/assets.js";

const MIGRATION_SETTING = "service_logo_key_migration_v2";
const NAMED_SERVICE_FILE = /^[a-z0-9-]{1,48}_[a-z0-9-]{1,56}_\d+_[0-9a-f-]{36}\.(png|jpg|webp|gif)$/i;
const CONTENT_EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function slugSegment(value, maxLength, fallback) {
  const slug = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || fallback;
}

async function readMigrationState(db) {
  const row = await db.prepare("SELECT setting_value FROM portal_settings WHERE setting_key = ?")
    .bind(MIGRATION_SETTING).first();
  return row?.setting_value || null;
}

async function renameLinkedServiceImages(env) {
  const services = await env.DB.prepare(
    "SELECT id, profile_id, name, logo_key AS logoKey FROM services WHERE logo_key LIKE 'service-logos/%' ORDER BY profile_id, id"
  ).all();

  const summary = {
    alreadyComplete: false,
    total: (services.results || []).length,
    migrated: 0,
    skipped: 0,
    missing: 0,
    failed: [],
  };

  for (const service of services.results || []) {
    const oldKey = service.logoKey;
    if (!oldKey || !isAllowedAssetKey(oldKey, "service")) {
      summary.skipped++;
      continue;
    }

    const currentFilename = oldKey.slice("service-logos/".length);
    if (NAMED_SERVICE_FILE.test(currentFilename)) {
      summary.skipped++;
      continue;
    }

    let object;
    try {
      object = await env.R2_LOGOS.get(oldKey);
      if (!object) {
        summary.missing++;
        summary.failed.push({ serviceId: Number(service.id), name: service.name, reason: "Referenced R2 object is missing." });
        continue;
      }

      const contentType = object.httpMetadata?.contentType || "image/png";
      const extension = CONTENT_EXTENSIONS[contentType];
      if (!extension) {
        summary.failed.push({ serviceId: Number(service.id), name: service.name, reason: "Unsupported legacy image content type: " + contentType });
        continue;
      }

      // Old uploads did not retain their original filenames. Use a clear fallback,
      // preserve the actual legacy object, and record that the source name was unavailable.
      const serviceSlug = slugSegment(service.name, 48, "service");
      const originalName = object.customMetadata?.originalName || "legacy-image";
      const originalSlug = slugSegment(originalName.replace(/\.[^.]+$/, ""), 56, "image");
      const newKey = "service-logos/" + serviceSlug + "_" + originalSlug + "_" + Number(service.id) + "_" + crypto.randomUUID() + "." + extension;

      const customMetadata = {
        ...(object.customMetadata || {}),
        purpose: "service",
        current: "true",
        serviceId: String(service.id),
        serviceName: String(service.name || "").slice(0, 100),
        originalName: "legacy-image (original filename was not retained)",
        migratedFrom: oldKey,
        migratedAt: new Date().toISOString(),
      };

      // Copy the object first. Do not change D1 or delete the old key until the new copy exists.
      await env.R2_LOGOS.put(newKey, object.body, {
        httpMetadata: object.httpMetadata,
        customMetadata,
      });

      const update = service.profile_id == null
        ? await env.DB.prepare(
            "UPDATE services SET logo_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND logo_key = ? AND profile_id IS NULL"
          ).bind(newKey, service.id, oldKey).run()
        : await env.DB.prepare(
            "UPDATE services SET logo_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND logo_key = ? AND profile_id = ?"
          ).bind(newKey, service.id, oldKey, service.profile_id).run();

      const verified = await env.DB.prepare("SELECT logo_key FROM services WHERE id = ?")
        .bind(service.id).first();

      if (Number(update.meta?.changes || 0) !== 1 || verified?.logo_key !== newKey) {
        await env.R2_LOGOS.delete(newKey);
        summary.failed.push({ serviceId: Number(service.id), name: service.name, reason: "D1 reference update could not be verified; original object retained." });
        continue;
      }

      // The new key is now authoritative. Delete the old key only after reference verification.
      const removed = await deleteAssetIfUnreferenced(env, oldKey);
      if (!removed) {
        summary.failed.push({ serviceId: Number(service.id), name: service.name, reason: "New image is current, but legacy object cleanup could not be confirmed.", oldKey, newKey });
        summary.migrated++;
        continue;
      }

      summary.migrated++;
    } catch (error) {
      summary.failed.push({
        serviceId: Number(service.id),
        name: service.name,
        reason: error?.message || "Unexpected migration error.",
      });
    }
  }

  return summary;
}

export async function onRequest({ request, env }) {
  const access = await requireCloudflareAccess(request, env);
  if (access.response) return access.response;
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
  if (!env.DB || !env.R2_LOGOS) return jsonResponse({ error: "D1 or R2 binding is missing." }, 503);

  let payload;
  try { payload = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON body." }, 400); }
  if (payload?.confirm !== true) return jsonResponse({ error: "Explicit confirmation is required." }, 400);

  const state = await readMigrationState(env.DB);
  if (state === "completed") {
    return jsonResponse({ success: true, alreadyComplete: true, migrated: 0, message: "Service image key migration is already complete." });
  }
  if (state === "running") {
    return jsonResponse({ success: false, running: true, message: "Service image migration is already running." }, 409);
  }

  const token = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO portal_settings (setting_key, setting_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP WHERE portal_settings.setting_value NOT LIKE 'running:%' AND portal_settings.setting_value != 'completed'"
  ).bind(MIGRATION_SETTING, "running:" + token).run();
  const lease = await readMigrationState(env.DB);
  if (lease !== "running:" + token) {
    if (lease === "completed") return jsonResponse({ success: true, alreadyComplete: true, migrated: 0 });
    return jsonResponse({ success: false, running: true, message: "Another migration request acquired the service image migration lock." }, 409);
  }

  try {
    const result = await renameLinkedServiceImages(env);
    if (result.failed.length) {
      await env.DB.prepare(
        "UPDATE portal_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ? AND setting_value = ?"
      ).bind("failed", MIGRATION_SETTING, "running:" + token).run();
      return jsonResponse({ success: false, ...result, message: "Some service images need attention. Successfully migrated images remain current; failed items were retained for retry." }, 207);
    }

    await env.DB.prepare(
      "UPDATE portal_settings SET setting_value = 'completed', updated_at = CURRENT_TIMESTAMP WHERE setting_key = ? AND setting_value = ?"
    ).bind(MIGRATION_SETTING, "running:" + token).run();

    return jsonResponse({
      success: true,
      ...result,
      currentKeyFormat: "service-name_original-filename_service-id_unique-id.extension",
      message: "Service image names have been migrated and marked current.",
    });
  } catch (error) {
    await env.DB.prepare(
      "UPDATE portal_settings SET setting_value = 'failed', updated_at = CURRENT_TIMESTAMP WHERE setting_key = ? AND setting_value = ?"
    ).bind(MIGRATION_SETTING, "running:" + token).run();
    return jsonResponse({ error: error?.message || "Service image migration failed." }, 500);
  }
}
