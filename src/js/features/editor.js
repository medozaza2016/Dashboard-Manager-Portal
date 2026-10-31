/* Anchor Dashboard - add/edit service dialog, tag picker, and logo preview. */
import { $, safe } from "../core/dom.js";
import { state } from "../state.js";
import { assetUrl, cleanupPendingServiceLogos, deleteUploadedImage, uploadImage } from "./images.js";
import { remoteSaveService } from "./api.js";
import { categories, toast } from "./persistence.js";
import { refreshTaxonomy } from "./taxonomy.js";
import { render } from "./admin.js";

function renderServiceLogoPreview(source,fallback="🔧"){
const image=$("serviceLogoImage"),text=$("serviceLogoFallback");
if(source){image.src=source;image.hidden=false;text.hidden=true;image.onerror=()=>{image.hidden=true;text.hidden=false}}
else{image.removeAttribute("src");image.hidden=true;text.textContent=fallback||"🔧";text.hidden=false}
$("removeServiceLogo").hidden=!($("serviceLogoKey").value||state.pendingServiceLogoFile);
}
function releaseServiceLogoPreview(){if(state.serviceLogoPreviewUrl){URL.revokeObjectURL(state.serviceLogoPreviewUrl);state.serviceLogoPreviewUrl=null}}
function closeServiceModal(){
state.serviceUploadToken++;state.serviceLogoUploadBusy=false;state.pendingServiceLogoFile=null;$("serviceModal").classList.remove("open");releaseServiceLogoPreview();$("serviceLogoFile").value="";
$("serviceLogoUploadStatus").textContent="Optional · PNG, JPEG, WebP or GIF · up to 5 MB";$("chooseServiceLogo").disabled=false;void cleanupPendingServiceLogos();
}
function renderServiceTagPicker(){
const selectedHost=$("serviceSelectedTags"),optionsHost=$("serviceTagOptions");if(!selectedHost||!optionsHost)return;
const selected=[...state.serviceSelectedTags].sort((a,b)=>a.localeCompare(b));
selectedHost.innerHTML=selected.length?selected.map(name=>'<button type="button" class="tag-picker-chip selected" data-remove-service-tag="'+safe(name)+'" title="Remove tag '+safe(name)+'">'+safe(name)+' <span aria-hidden="true">×</span></button>').join(""):'<span class="service-tag-empty">No tags selected yet.</span>';
const query=($("serviceTagSearch")?.value||state.serviceTagQuery||"").trim().toLowerCase();
const available=state.tagRecords.filter(tag=>!query||tag.name.toLowerCase().includes(query));
optionsHost.innerHTML=available.length?available.map(tag=>{const picked=state.serviceSelectedTags.has(tag.name);return '<button type="button" class="tag-picker-chip'+(picked?' selected':'')+'" data-toggle-service-tag="'+safe(tag.name)+'" aria-pressed="'+(picked?'true':'false')+'"><span aria-hidden="true">'+(picked?'✓':'+')+'</span>'+safe(tag.name)+'</button>'}).join(""):'<span class="service-tag-empty">No matching tags. Add new tags under Admin → Tags.</span>';
selectedHost.querySelectorAll("[data-remove-service-tag]").forEach(button=>button.onclick=()=>{state.serviceSelectedTags.delete(button.dataset.removeServiceTag);renderServiceTagPicker()});
optionsHost.querySelectorAll("[data-toggle-service-tag]").forEach(button=>button.onclick=()=>{const name=button.dataset.toggleServiceTag;if(state.serviceSelectedTags.has(name))state.serviceSelectedTags.delete(name);else state.serviceSelectedTags.add(name);renderServiceTagPicker()});
}
function openModal(id,presetCategory=null){
const s=state.services.find(item=>item.id==id);void cleanupPendingServiceLogos();state.serviceUploadToken++;state.serviceLogoUploadBusy=false;state.pendingServiceLogoFile=null;releaseServiceLogoPreview();
$("serviceForm").reset();$("serviceId").value=s?s.id:"";$("serviceLogoKey").value=s?.logoKey||"";
$("modalTitle").textContent=s?"Edit service":"Add service";$("name").value=s?.name||"";$("url").value=s?.url||"";$("description").value=s?.description||"";$("icon").value=s?.icon||"🔧";
state.serviceSelectedTags=new Set(s?.tags||[]);state.serviceTagQuery="";$("serviceTagSearch").value="";
const availableCategories=categories().filter(c=>c!=="All");
$("category").innerHTML=availableCategories.map(c=>'<option value="'+safe(c)+'">'+safe(c)+'</option>').join("");
$("category").value=s?.category||presetCategory||(availableCategories.includes("Infrastructure")?"Infrastructure":availableCategories[0]||"");
renderServiceTagPicker();if(state.apiConnected&&!state.taxonomyLoaded&&!state.taxonomyBusy)void refreshTaxonomy(false);
renderServiceLogoPreview(s?.logoKey&&state.apiConnected?assetUrl(s.logoKey):"",s?.icon||"🔧");
$("serviceLogoUploadStatus").textContent="Optional · PNG, JPEG, WebP or GIF · up to 5 MB · saved with the service";$("serviceModal").classList.add("open");
}

$("serviceForm").onsubmit=async e=>{
e.preventDefault();if(state.serviceLogoUploadBusy){toast("Wait for the image operation to finish.");return}
const originalPage=state.page,wasOnManagePage=(state.page==="category"||state.page==="tag")&&state.reorderEnabled,originalCategory=state.current,originalTag=state.activeTag,wasEditMode=state.reorderEnabled;
let id=$("serviceId").value;
const existing=state.services.find(s=>String(s.id)===String(id));
const selectedFile=state.pendingServiceLogoFile;
if(selectedFile&&!state.apiConnected){toast("Connect to the shared database before saving a service image.");return}
state.serviceLogoUploadBusy=true;
let item={id:id?Number(id):state.nextId++,name:$("name").value.trim(),url:$("url").value.trim(),category:$("category").value,description:$("description").value.trim(),icon:$("icon").value.trim()||"🔧",logoKey:selectedFile?(existing?.logoKey||null):($("serviceLogoKey").value||null),tags:[...state.serviceSelectedTags],favorite:existing?.favorite||false};
let newUploadedKey=null;
try{
if(state.apiConnected){
  // Save service fields first so a newly created service has a permanent ID.
  item=await remoteSaveService(item,!id);
  id=String(item.id);$("serviceId").value=id;
  state.services=existing?state.services.map(s=>String(s.id)===id?item:s):[item,...state.services];
  state.nextId=Math.max(state.nextId,Number(item.id)+1);

  if(selectedFile){
    $("serviceLogoUploadStatus").textContent="Uploading named image to R2…";
    const uploaded=await uploadImage(selectedFile,"service",{serviceId:item.id,profileId:state.currentProfile});
    newUploadedKey=uploaded.key;
    const replacement={...item,logoKey:uploaded.key};
    item=await remoteSaveService(replacement,false);
    newUploadedKey=null;
    state.services=state.services.map(s=>String(s.id)===String(item.id)?item:s);
    $("serviceLogoKey").value=item.logoKey||"";
  }else{
    // A cleared logoKey removes the existing object after D1 has stopped referencing it.
    state.services=state.services.map(s=>String(s.id)===String(item.id)?item:s);
  }
}else{
  if(id)state.services=state.services.map(s=>String(s.id)===String(id)?item:s);
  else{state.services.unshift(item);state.nextId=Math.max(state.nextId,Number(item.id)+1)}
}
closeServiceModal();
if(wasOnManagePage){if(originalPage==="tag"){state.page="tag";state.activeTag=originalTag;state.current="All"}else{state.page="category";state.current=originalCategory}state.reorderEnabled=wasEditMode}else{state.page="favorites";state.current="All";state.reorderEnabled=false}
render();toast(state.apiConnected?(selectedFile?"Service and image saved to database":id?"Service saved to database":"Service added to database"):(id?"Service saved locally only":"Service added locally only"));
}catch(error){
 if(newUploadedKey)await deleteUploadedImage(newUploadedKey);
 state.serviceLogoUploadBusy=false;
 $("chooseServiceLogo").disabled=false;
 toast((id?"Service details saved, but image update failed: ":"Could not save service: ")+(error.message||"database error"));
}
};
$("cancel").onclick=()=>closeServiceModal();$("add").onclick=()=>{if(state.page==="category"&&state.reorderEnabled)openModal(null,state.current)};$("search").oninput=()=>{if(state.reorderEnabled&&$("search").value.trim())state.reorderEnabled=false;render()};
$("reorderToggle").onclick=()=>{if(state.page!=="category"&&state.page!=="tag"&&state.page!=="favorites")return;if(!state.reorderEnabled&&$("search").value.trim()){toast("Clear the global search before reordering.");return}state.reorderEnabled=!state.reorderEnabled;render();toast(state.reorderEnabled?(state.page==="favorites"?"Drag favorite services to change their order":state.page==="tag"?"Edit mode enabled for tag: "+state.activeTag:"Edit mode enabled for "+state.current):(state.page==="favorites"?"Favorites reordering finished":"Edit mode finished"))};
$("catalogControlsToggle").onclick=()=>{
 state.catalogControlsExpanded=!state.catalogControlsExpanded;
 const panel=$("catalogControlsPanel"),button=$("catalogControlsToggle");
 panel.classList.toggle("expanded",state.catalogControlsExpanded);
 panel.setAttribute("aria-hidden",state.catalogControlsExpanded?"false":"true");
 button.setAttribute("aria-expanded",state.catalogControlsExpanded?"true":"false");
 button.classList.toggle("active",state.catalogControlsExpanded);
};
$("cardsBtn").onclick=()=>{state.view="cards";state.localViewPreference=true;render()};$("listBtn").onclick=()=>{state.view="list";state.localViewPreference=true;render()};$("dotsBtn").onclick=()=>{state.view="dots";state.localViewPreference=true;render()};$("regularBtn").onclick=()=>{state.density="regular";state.view="cards";state.localViewPreference=true;render()};$("slimBtn").onclick=()=>{state.density="slim";state.view="cards";state.localViewPreference=true;render()};

export { renderServiceLogoPreview, releaseServiceLogoPreview, closeServiceModal, renderServiceTagPicker, openModal };
