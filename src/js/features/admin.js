/* Anchor Dashboard - admin page shell and the top-level render dispatcher. */
import { APP_VERSION } from "../config.js";
import { $ } from "../core/dom.js";
import { state } from "../state.js";
import { applyServiceImageSize, normalizeServiceImageSize, renderServiceImageSizePreview } from "./images.js";
import { renderD1Status, renderR2Status } from "./integrations.js";
import { categories, persist } from "./persistence.js";
import { bindRenderedActions, nav, renderCatalog, showPage } from "./catalog.js";
import { applyBranding } from "./branding.js";
import { refreshTaxonomy, renderCategoryManager, renderTagManager } from "./taxonomy.js";

function renderAdminPage(){
const categoriesPanel=$("adminCategoriesPanel"),tagsPanel=$("adminTagsPanel");if(!categoriesPanel||!tagsPanel)return;
categoriesPanel.hidden=state.adminTab!=="categories";tagsPanel.hidden=state.adminTab!=="tags";
document.querySelectorAll("[data-admin-tab]").forEach(button=>{const active=button.dataset.adminTab===state.adminTab;button.classList.toggle("active",active);button.setAttribute("aria-selected",active?"true":"false")});
if(state.adminTab==="categories")renderCategoryManager();if(state.adminTab==="tags")renderTagManager();
}
function setAdminTab(tab){if(!["categories","tags"].includes(tab))return;state.adminTab=tab;state.page="admin";showPage();renderAdminPage();bindRenderedActions();void refreshTaxonomy(false,state.currentProfile)}
function renderSettings(){$("brandingName").value=state.branding.name||"Anchor";$("brandingSubtitle").value=state.branding.subtitle||"";$("brandingLogo").value=state.branding.logo||"";$("landingSetting").value=state.preferences.landingPage==="all"?"all":"favorites";$("defaultViewSetting").value=state.preferences.defaultView||"list";$("serviceImageSizeSetting").value=normalizeServiceImageSize(state.preferences.serviceImageSize);renderServiceImageSizePreview(state.preferences.serviceImageSize);$("showCardDescriptionsSetting").checked=!!state.preferences.showCardDescriptions;$("sidebarCollapsedSetting").checked=!!state.preferences.sidebarCollapsed;$("settingsVersion").textContent=APP_VERSION;applyBranding();renderD1Status();renderR2Status()}
function render(){applyServiceImageSize(state.preferences.serviceImageSize);nav();showPage();if(state.page==="settings")renderSettings();else if(state.page==="admin")renderAdminPage();else renderCatalog();$("versionLabel").textContent="v"+APP_VERSION;applyBranding();bindRenderedActions();persist()}

export { renderAdminPage, setAdminTab, renderSettings, render };
