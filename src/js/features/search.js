/* Anchor Dashboard - global search: scoring, ranking, and match highlighting.

   The original catalog filter was a single substring test over joined fields,
   which ranked nothing and could not tell "matched in the description" from
   "matched the service name". This module scores each service per query term so
   the catalog, the quick-results dropdown, and the result count all agree. */
import { safe } from "../core/dom.js";
import { state } from "../state.js";
import { usageFor } from "./usage.js";

const FIELD_WEIGHT = { name: 100, category: 40, tag: 30, description: 14, url: 10 };
const FAVORITE_BONUS = 6;
const USAGE_BONUS_CAP = 12;

function normalize(value) {
  return String(value == null ? "" : value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function tokenize(query) {
  return normalize(query).split(/\s+/).filter(Boolean);
}

function scoreService(service, terms, profileId = state.currentProfile) {
  if (!terms.length) return { score: 0, field: "" };
  const name = normalize(service.name);
  const category = normalize(service.category);
  const description = normalize(service.description);
  const url = normalize(service.url);
  const tags = (Array.isArray(service.tags) ? service.tags : []).map(normalize);
  let score = 0;
  let bestField = "";
  let bestWeight = 0;

  for (const term of terms) {
    let termScore = 0;
    let field = "";
    if (name === term) { termScore = FIELD_WEIGHT.name + 40; field = "name"; }
    else if (name.startsWith(term)) { termScore = FIELD_WEIGHT.name + 20; field = "name"; }
    else if (name.includes(term)) { termScore = FIELD_WEIGHT.name; field = "name"; }
    if (category === term || category.startsWith(term)) {
      if (FIELD_WEIGHT.category + 10 > termScore) { termScore = FIELD_WEIGHT.category + 10; field = "category"; }
    } else if (category.includes(term) && FIELD_WEIGHT.category > termScore) {
      termScore = FIELD_WEIGHT.category; field = "category";
    }
    if (tags.some((tag) => tag === term) && FIELD_WEIGHT.tag + 8 > termScore) {
      termScore = FIELD_WEIGHT.tag + 8; field = "tag";
    } else if (tags.some((tag) => tag.includes(term)) && FIELD_WEIGHT.tag > termScore) {
      termScore = FIELD_WEIGHT.tag; field = "tag";
    }
    if (description.includes(term) && FIELD_WEIGHT.description > termScore) {
      termScore = FIELD_WEIGHT.description; field = "description";
    }
    if (url.includes(term) && FIELD_WEIGHT.url > termScore) {
      termScore = FIELD_WEIGHT.url; field = "url";
    }
    if (!termScore) return null;
    score += termScore;
    if (termScore > bestWeight) { bestWeight = termScore; bestField = field; }
  }

  if (service.favorite) score += FAVORITE_BONUS;
  const used = usageFor(service.id, profileId).count;
  if (used) score += Math.min(USAGE_BONUS_CAP, Math.log2(used + 1) * 3);

  return { score, field: bestField };
}

function searchServices(items, query, profileId = state.currentProfile) {
  const terms = tokenize(query);
  if (!terms.length) return items.map((service) => ({ service, score: 0, field: "" }));
  const ranked = [];
  for (const service of items) {
    const result = scoreService(service, terms, profileId);
    if (result) ranked.push({ service, score: result.score, field: result.field });
  }
  return ranked.sort((a, b) =>
    b.score - a.score ||
    String(a.service.name || "").localeCompare(String(b.service.name || ""), undefined, { sensitivity: "base", numeric: true })
  );
}

function searchCategories(query, items = state.services) {
  const term = normalize(query);
  if (!term) return [];
  const names = [...new Set(items.map((service) => service.category).filter(Boolean))];
  return names
    .map((name) => {
      const normalized = normalize(name);
      if (!normalized.includes(term)) return null;
      const count = items.filter((service) => service.category === name).length;
      return { name, count, score: normalized === term ? 100 : normalized.startsWith(term) ? 80 : 40 };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function searchTags(query, items = state.services) {
  const term = normalize(query);
  if (!term) return [];
  const names = [...new Set(items.flatMap((service) => (Array.isArray(service.tags) ? service.tags : [])).filter(Boolean))];
  return names
    .map((name) => {
      const normalized = normalize(name);
      if (!normalized.includes(term)) return null;
      const count = items.filter((service) => (service.tags || []).includes(name)).length;
      return { name, count, score: normalized === term ? 100 : normalized.startsWith(term) ? 80 : 40 };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text, query) {
  const raw = String(text == null ? "" : text);
  const terms = tokenize(query);
  if (!terms.length || !raw) return safe(raw);
  const pattern = new RegExp("(" + terms.map(escapeRegExp).join("|") + ")", "gi");
  let output = "";
  let cursor = 0;
  for (const match of raw.matchAll(pattern)) {
    output += safe(raw.slice(cursor, match.index)) + '<mark class="search-hit">' + safe(match[0]) + "</mark>";
    cursor = match.index + match[0].length;
  }
  return output + safe(raw.slice(cursor));
}

export { normalize, tokenize, scoreService, searchServices, searchCategories, searchTags, highlight };
