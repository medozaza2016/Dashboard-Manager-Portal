/* Anchor Dashboard - composition root: event wiring and first boot. */
import { APP_VERSION, MAX_IMAGE_BYTES } from "./config.js";
import { $ } from "./core/dom.js";
import { svg } from "./icons.js";
import { state } from "./state.js";
import { deleteUploadedImage, normalizeServiceImageSize, renderServiceImageSizePreview, uploadImage } from "./features/images.js";
import { checkD1Connection, checkPagesDeployment, checkR2Connection, importSelectedAccessApps, refreshAccessApps, renderAccessSync } from "./features/integrations.js";
import { bindProfileSwitcher, updateProfileUI } from "./features/profile.js";
import { apiRequest, loadRemoteData } from "./features/api.js";
import { categories, load, persist, toast } from "./features/persistence.js";
import { nav, navigatePage } from "./features/catalog.js";
import { applyBranding } from "./features/branding.js";
import { closeAppConfirm, closeTaxonomyModal, confirmInApp, openTaxonomyModal, refreshTaxonomy, renderCategoryManager, renderTagManager, saveTaxonomyModal } from "./features/taxonomy.js";
import { render, renderSettings, setAdminTab } from "./features/admin.js";
import { releaseServiceLogoPreview, renderServiceLogoPreview, renderServiceTagPicker } from "./features/editor.js";

function updateCollapseButton(){const collapsed=$("sidebar").classList.contains("collapsed");$("collapse").title=collapsed?"Expand sidebar":"Collapse sidebar";$("collapse").setAttribute("aria-label",collapsed?"Expand sidebar":"Collapse sidebar");$("collapse").innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 4v16"/><path d="'+(collapsed?"m10 7 5 5-5 5":"m14 7-5 5 5 5")+'"/></svg>'}
$("collapse").onclick=()=>{$("sidebar").classList.toggle("collapsed");updateCollapseButton()};updateCollapseButton();
$("toggleCategoriesSection").onclick=()=>{state.preferences.sidebarCategoriesCollapsed=!state.preferences.sidebarCategoriesCollapsed;nav();persist()};
$("toggleTagsSection").onclick=()=>{state.preferences.sidebarTagsCollapsed=!state.preferences.sidebarTagsCollapsed;nav();persist()};

document.querySelectorAll(".nav[data-page]").forEach(b=>b.onclick=()=>navigatePage(b.dataset.page));
$("refreshTaxonomy").onclick=()=>refreshTaxonomy(true);
$("addCategoryButton").onclick=()=>openTaxonomyModal("category");
$("addTagButton").onclick=()=>openTaxonomyModal("tag");
$("taxonomyModalForm").onsubmit=saveTaxonomyModal;
$("addCategoryFromService").onclick=()=>openTaxonomyModal("category",null,{returnToService:true});
$("addTagFromService").onclick=()=>openTaxonomyModal("tag",null,{returnToService:true});
$("taxonomyModalCancel").onclick=closeTaxonomyModal;
$("taxonomyModalBackdrop").addEventListener("click",event=>{if(event.target===$("taxonomyModalBackdrop"))closeTaxonomyModal()});
$("appConfirmCancel").onclick=()=>closeAppConfirm(false);
$("appConfirmAccept").onclick=()=>closeAppConfirm(true);
$("appConfirmModal").addEventListener("click",event=>{if(event.target===$("appConfirmModal"))closeAppConfirm(false)});
document.addEventListener("keydown",event=>{if(event.key==="Escape"){if(!$("taxonomyModalBackdrop").hidden)closeTaxonomyModal();if(!$("appConfirmModal").hidden)closeAppConfirm(false)}});
document.querySelectorAll("[data-admin-tab]").forEach(button=>button.onclick=()=>setAdminTab(button.dataset.adminTab));

$("categoryFilter").oninput=()=>renderCategoryManager();
$("tagFilter").oninput=()=>renderTagManager();
$("serviceTagSearch").oninput=()=>{state.serviceTagQuery=$("serviceTagSearch").value;renderServiceTagPicker()};


updateProfileUI();
bindProfileSwitcher();
loadRemoteData();
$("export").onclick=async()=>{try{let backup;if(state.apiConnected){backup=await apiRequest("backup")}else{backup={schemaVersion:1,exportedAt:new Date().toISOString(),source:"browser-local",version:APP_VERSION,services:state.services,categories:[...new Map(state.services.map(s=>[s.category,{name:s.category,icon:"grid"}])).values()],branding:state.branding,preferences:state.preferences,theme:"anchor"}}const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:"application/json"}));a.download="dashboard-manager-portal-backup-"+new Date().toISOString().slice(0,10)+".json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast(state.apiConnected?"Shared D1 backup exported":"Browser-only backup exported, D1 is not connected")}catch(error){toast("Backup export failed: "+(error.message||"database error"))}};
$("import").onclick=()=>$("importFile").click();$("importFile").onchange=async e=>{try{const file=e.target.files&&e.target.files[0];if(!file)return;const d=JSON.parse(await file.text());if(!d||!Array.isArray(d.services))throw Error("Backup must contain a services array");if(d.services.length>200)throw Error("Backups can contain at most 200 services");if(state.apiConnected){const proceed=await confirmInApp({title:"Restore shared database backup?",message:"This will replace the current services, categories, tags, branding, and preferences in the shared database. Export a backup first if you need to keep the current data.",confirmLabel:"Restore database"});if(!proceed)return;const result=await apiRequest("backup",{method:"POST",body:JSON.stringify(d)});await loadRemoteData();state.page="favorites";state.current="All";render();toast("D1 restored: "+result.serviceCount+" services, "+result.categoryCount+" categories")}else{const proceed=await confirmInApp({title:"Import browser-only backup?",message:"The shared database is not connected. This imports the backup into this browser only and will not update D1.",confirmLabel:"Import backup"});if(!proceed)return;state.services=d.services.map((s,i)=>({...s,id:Number(s.id)||i+1,tags:Array.isArray(s.tags)?s.tags:[],favorite:!!s.favorite}));if(d.branding)state.branding={...state.branding,...d.branding};if(d.preferences)state.preferences={...state.preferences,...d.preferences,showCardDescriptions:typeof d.preferences.showCardDescriptions==="boolean"?d.preferences.showCardDescriptions:typeof d.preferences.showSlimDescriptions==="boolean"?d.preferences.showSlimDescriptions:false};state.preferences.landingPage=state.preferences.landingPage==="all"?"all":"favorites";state.nextId=Math.max(0,...state.services.map(s=>Number(s.id)||0))+1;state.page="favorites";state.current="All";render();toast("Backup imported into this browser only")}}catch(error){toast("Could not restore backup: "+(error.message||"invalid JSON"))}finally{e.target.value=""}};
$("help").onclick=()=>toast("Anchor Dashboard. Version "+APP_VERSION+". Catalog changes save to shared D1 when connected.");
$("brandingName").addEventListener("input",()=>{$("settingsBrandPreview").textContent=($("brandingName").value||"Anchor")+(($("brandingSubtitle").value)?" "+$("brandingSubtitle").value:"")});
$("brandingSubtitle").addEventListener("input",()=>{$("settingsBrandPreview").textContent=($("brandingName").value||"Anchor")+(($("brandingSubtitle").value)?" "+$("brandingSubtitle").value:"")});
$("brandingLogo").addEventListener("input",()=>{state.branding.logo=$("brandingLogo").value.trim();applyBranding()});
$("chooseBrandingLogo").onclick=()=>{if(!state.apiConnected){toast("The shared database connection is required for R2 uploads.");return}$("brandingLogoFile").click()};
$("brandingLogoFile").onchange=async e=>{
const file=e.target.files&&e.target.files[0];e.target.value="";if(!file)return;
if(file.size<1||file.size>MAX_IMAGE_BYTES){toast("Choose an image no larger than 5 MB.");return}
if(!["image/png","image/jpeg","image/webp","image/gif"].includes(file.type.toLowerCase())){toast("Use a PNG, JPEG, WebP or GIF image.");return}
const token=++state.brandingLogoUploadToken;state.brandingLogoUploadBusy=true;$("chooseBrandingLogo").disabled=true;$("brandingLogoUploadStatus").textContent="Uploading logo to private R2 storage…";
const objectUrl=URL.createObjectURL(file),previousUrl=state.brandingLogoPreviewUrl,previousKey=state.branding.logoKey||null;
try{
const uploaded=await uploadImage(file,"branding");
if(token!==state.brandingLogoUploadToken){await deleteUploadedImage(uploaded.key);URL.revokeObjectURL(objectUrl);return}
state.branding.logoKey=uploaded.key;state.brandingLogoPreviewUrl=objectUrl;state.pendingBrandingLogoKeys.add(uploaded.key);
if(previousKey&&state.pendingBrandingLogoKeys.has(previousKey)&&previousKey!==uploaded.key){state.pendingBrandingLogoKeys.delete(previousKey);await deleteUploadedImage(previousKey)}
if(previousUrl)URL.revokeObjectURL(previousUrl);
$("brandingLogoUploadStatus").textContent="Uploaded to R2. Select Save settings to publish the logo.";applyBranding();
}catch(error){URL.revokeObjectURL(objectUrl);$("brandingLogoUploadStatus").textContent=error.message||"Upload failed.";toast("Portal logo upload failed: "+(error.message||"upload failed"))}
finally{if(token===state.brandingLogoUploadToken){state.brandingLogoUploadBusy=false;$("chooseBrandingLogo").disabled=false}}
};
$("removeBrandingLogo").onclick=()=>{
if(state.brandingLogoUploadBusy){toast("Wait for the upload to finish.");return}
if(state.brandingLogoPreviewUrl){URL.revokeObjectURL(state.brandingLogoPreviewUrl);state.brandingLogoPreviewUrl=null}
if(state.branding.logoKey&&state.pendingBrandingLogoKeys.has(state.branding.logoKey)){void deleteUploadedImage(state.branding.logoKey);state.pendingBrandingLogoKeys.delete(state.branding.logoKey)}
state.branding.logoKey=null;$("brandingLogoUploadStatus").textContent="Logo removal will take effect when you save settings.";applyBranding();
};
$("chooseServiceLogo").onclick=()=>{if(!state.apiConnected){toast("The shared database connection is required for R2 uploads.");return}$("serviceLogoFile").click()};
$("serviceLogoFile").onchange=e=>{
const file=e.target.files&&e.target.files[0];e.target.value="";if(!file)return;
if(file.size<1||file.size>MAX_IMAGE_BYTES){toast("Choose an image no larger than 5 MB.");return}
if(!["image/png","image/jpeg","image/webp","image/gif"].includes(file.type.toLowerCase())){toast("Use a PNG, JPEG, WebP or GIF image.");return}
state.pendingServiceLogoFile=file;
releaseServiceLogoPreview();state.serviceLogoPreviewUrl=URL.createObjectURL(file);
renderServiceLogoPreview(state.serviceLogoPreviewUrl,$("icon").value||"🔧");
$("serviceLogoUploadStatus").textContent="Selected: "+file.name+". The image will be uploaded when you save the service.";
};
$("removeServiceLogo").onclick=()=>{
if(state.serviceLogoUploadBusy){toast("Wait for the image operation to finish.");return}
state.pendingServiceLogoFile=null;releaseServiceLogoPreview();$("serviceLogoFile").value="";$("serviceLogoKey").value="";
renderServiceLogoPreview("",$("icon").value||"🔧");
$("serviceLogoUploadStatus").textContent="Image removal will take effect when you save the service.";
};
$("testD1Connection").onclick=()=>checkD1Connection(true);
$("refreshR2Connection").onclick=()=>checkR2Connection(true);
$("refreshAccessApps").onclick=()=>refreshAccessApps(true);
$("importAccessApps").onclick=()=>importSelectedAccessApps();
$("accessSyncSelectAll").onchange=e=>{const missing=state.accessSyncState.apps.filter(app=>app.existingServiceId==null);for(const app of missing){if(e.target.checked)state.accessSyncSelectedIds.add(app.accessId);else state.accessSyncSelectedIds.delete(app.accessId)}renderAccessSync()};
$("accessSyncShowAll").onchange=e=>{state.accessSyncShowAll=e.target.checked;if(!state.accessSyncShowAll){state.accessSyncSelectedIds=new Set(state.accessSyncState.apps.filter(app=>app.existingServiceId==null&&state.accessSyncSelectedIds.has(app.accessId)).map(app=>app.accessId))}renderAccessSync()};
$("refreshPagesDeployment").onclick=()=>checkPagesDeployment(true);
$("settingsForm").onsubmit=async e=>{
e.preventDefault();if(state.brandingLogoUploadBusy){toast("Wait for the portal logo upload to finish.");return}
const nextBranding={name:$("brandingName").value.trim()||"Anchor",subtitle:$("brandingSubtitle").value.trim(),logo:$("brandingLogo").value.trim(),logoKey:state.branding.logoKey||null};
const nextPreferences={theme:"anchor",landingPage:$("landingSetting").value,defaultView:$("defaultViewSetting").value,sidebarCollapsed:$("sidebarCollapsedSetting").checked,showCardDescriptions:$("showCardDescriptionsSetting").checked,serviceImageSize:normalizeServiceImageSize($("serviceImageSizeSetting").value)};
try{
if(state.apiConnected)await apiRequest("settings",{method:"PUT",body:JSON.stringify({branding:nextBranding,preferences:nextPreferences})});
state.branding=nextBranding;state.persistedBrandingLogoKey=nextBranding.logoKey;state.preferences=nextPreferences;
for(const key of [...state.pendingBrandingLogoKeys]){if(key===state.persistedBrandingLogoKey)state.pendingBrandingLogoKeys.delete(key);else{await deleteUploadedImage(key);state.pendingBrandingLogoKeys.delete(key)}}
if(state.brandingLogoPreviewUrl){URL.revokeObjectURL(state.brandingLogoPreviewUrl);state.brandingLogoPreviewUrl=null}
applyBranding();
$("brandingLogoUploadStatus").textContent="Logo and settings saved.";
 state.view=state.preferences.defaultView==="list"?"list":state.preferences.defaultView==="dots"?"dots":"cards";state.density=state.preferences.defaultView==="slim"?"slim":"regular";state.localViewPreference=true;
$("sidebar").classList.toggle("collapsed",state.preferences.sidebarCollapsed);updateCollapseButton();render();toast(state.apiConnected?"Settings saved to database":"Settings saved locally only")
}catch(error){toast("Could not save settings: "+(error.message||"database error"))}
};
$("resetBranding").onclick=()=>{state.branding={name:"Anchor",subtitle:"Dashboard",logo:"",logoKey:null};if(state.brandingLogoPreviewUrl){URL.revokeObjectURL(state.brandingLogoPreviewUrl);state.brandingLogoPreviewUrl=null}renderSettings();toast("Branding reset. Save settings to keep it.")};

$("serviceImageSizeSetting").oninput=()=>renderServiceImageSizePreview($("serviceImageSizeSetting").value);
load();updateProfileUI();state.preferences.landingPage=state.preferences.landingPage==="all"?"all":"favorites";state.page=state.preferences.landingPage;state.view=state.preferences.defaultView==="cards"||state.preferences.defaultView==="slim"?"cards":"list";state.density=state.preferences.defaultView==="slim"?"slim":"regular";$("sidebar").classList.toggle("collapsed",!!state.preferences.sidebarCollapsed);render();loadRemoteData();refreshTaxonomy(false);checkPagesDeployment(false);checkR2Connection(false);refreshAccessApps(false);
