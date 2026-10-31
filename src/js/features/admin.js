/* Anchor Dashboard - admin page shell and the top-level render dispatcher. */
import { APP_VERSION } from "../config.js";
import { $ } from "../core/dom.js";
import { state } from "../state.js";
import { applyServiceImageSize, normalizeServiceImageSize, renderServiceImageSizePreview } from "./images.js";
import { hydrateAssetImages } from "./image-cache.js";
import { renderD1Status, renderPagesDeployment, renderR2Status, renderSettingsStatusStrip } from "./integrations.js";
import { categories, persist } from "./persistence.js";
import { bindRenderedActions, nav, renderCatalog, renderQuickResults, showPage } from "./catalog.js";
import { applyBranding } from "./branding.js";
import { refreshTaxonomy, renderCategoryManager, renderTagManager } from "./taxonomy.js";
import { assetCacheStats, formatBytes } from "./image-cache.js";
import { usageSummary } from "./usage.js";

function renderAdminPage(){
const categoriesPanel=$("adminCategoriesPanel"),tagsPanel=$("adminTagsPanel");if(!categoriesPanel||!tagsPanel)return;
categoriesPanel.hidden=state.adminTab!=="categories";tagsPanel.hidden=state.adminTab!=="tags";
document.querySelectorAll("[data-admin-tab]").forEach(button=>{const active=button.dataset.adminTab===state.adminTab;button.classList.toggle("active",active);button.setAttribute("aria-selected",active?"true":"false")});
if(state.adminTab==="categories")renderCategoryManager();if(state.adminTab==="tags")renderTagManager();
}
function setAdminTab(tab){if(!["categories","tags"].includes(tab))return;state.adminTab=tab;state.page="admin";showPage();renderAdminPage();bindRenderedActions();void refreshTaxonomy(false,state.currentProfile)}
function setSettingsDirty(dirty){
 const bar=$("settingsSavebar"),label=$("settingsSaveState"),hint=$("settingsSaveHint");
 if(!bar||!label)return;
 bar.classList.toggle("is-dirty",!!dirty);
 label.textContent=dirty?"Unsaved changes":"All changes saved";
 if(hint)hint.textContent=dirty?"Save to apply them, or reload the page to discard.":(state.apiConnected?"Settings save to the shared database.":"Database unavailable — settings are kept in this browser only.");
}
async function renderImageCacheStats(){
 const count=$("assetCacheCount"),size=$("assetCacheSize"),status=$("assetCacheStatus");
 if(!count)return;
 const stats=await assetCacheStats();
 if(!stats.supported){count.textContent="—";size.textContent="—";if(status)status.textContent="This browser does not expose Cache Storage, so images rely on HTTP caching only.";return}
 count.textContent=String(stats.count);
 size.textContent=formatBytes(stats.bytes);
 if(status)status.textContent=stats.count?"Cached on this device. Clearing forces one fresh R2 read per logo, then it caches again.":"Nothing cached yet — each logo is stored the first time it is shown.";
}
function renderUsageCard(){
 const summary=usageSummary();
 if($("usageServiceCount"))$("usageServiceCount").textContent=String(summary.tracked);
 if($("usageOpenCount"))$("usageOpenCount").textContent=String(summary.opens);
 if($("usageWeekCount"))$("usageWeekCount").textContent=String(summary.thisWeek);
}
function renderSettings(){
 $("brandingName").value=state.branding.name||"Anchor";$("brandingSubtitle").value=state.branding.subtitle||"";$("brandingLogo").value=state.branding.logo||"";
 $("landingSetting").value=state.preferences.landingPage==="all"?"all":"favorites";
 $("defaultViewSetting").value=state.preferences.defaultView||"list";
 $("serviceImageSizeSetting").value=normalizeServiceImageSize(state.preferences.serviceImageSize);
 renderServiceImageSizePreview(state.preferences.serviceImageSize);
 $("showCardDescriptionsSetting").checked=!!state.preferences.showCardDescriptions;
 $("sidebarCollapsedSetting").checked=!!state.preferences.sidebarCollapsed;
 if($("groupBySetting"))$("groupBySetting").value=state.groupBy;
 if($("sortSetting"))$("sortSetting").value=state.sortMode;
 $("settingsVersion").textContent=APP_VERSION;
 applyBranding();renderD1Status();renderR2Status();renderPagesDeployment();renderSettingsStatusStrip();
 renderUsageCard();void renderImageCacheStats();
 setSettingsDirty(false);
}
function render(){applyServiceImageSize(state.preferences.serviceImageSize);nav();showPage();if(state.page==="settings")renderSettings();else if(state.page==="admin")renderAdminPage();else renderCatalog();$("versionLabel").textContent="v"+APP_VERSION;applyBranding();bindRenderedActions();renderQuickResults();hydrateAssetImages();persist()}

export { renderAdminPage, setAdminTab, renderSettings, setSettingsDirty, render };
