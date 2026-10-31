/* Anchor Dashboard - category and tag administration, dialogs, drag ordering. */
import { CATEGORY_ICON_OPTIONS } from "../config.js";
import { $, safe } from "../core/dom.js";
import { categorySvg, svg } from "../icons.js";
import { state } from "../state.js";
import { apiRequest, loadRemoteData } from "./api.js";
import { categories, load, saveProfileCache, toast } from "./persistence.js";
import { nav, renderCatalog } from "./catalog.js";
import { renderAdminPage } from "./admin.js";
import { renderServiceTagPicker } from "./editor.js";

function taxonomyMessage(id,message,isError=false){const el=$(id);if(!el)return;el.textContent=message||"";el.classList.toggle("error",!!isError)}
function closeTaxonomyModal(){
 $("taxonomyModalBackdrop").hidden=true;
 $("taxonomyModalBackdrop").setAttribute("aria-hidden","true");
 state.taxonomyModalType=null;state.taxonomyModalId=null;state.taxonomyModalOriginalName="";state.taxonomyReturnToService=false;
}
function openTaxonomyModal(type,id=null,options={}){
 if(!state.apiConnected){toast("Connect to the shared database first.");return}
 const isCategory=type==="category",isNew=id==null;
 const record=isCategory?state.taxonomyCategories.find(item=>Number(item.id)===Number(id)):state.tagRecords.find(item=>Number(item.id)===Number(id));
 state.taxonomyModalType=type;state.taxonomyModalId=isNew?null:Number(id);state.taxonomyModalOriginalName=record?.name||"";state.taxonomyReturnToService=!!options.returnToService;
 $("taxonomyModalTitle").textContent=(isNew?"Add ":"Edit ")+(isCategory?"category":"tag");
 $("taxonomyModalHelp").textContent=isCategory?"Category names appear in the sidebar. Empty categories can be retained as placeholders.":"Tags can be assigned to services and used as sidebar filters.";
 if(isCategory){
  const options=CATEGORY_ICON_OPTIONS.map(([value,label])=>'<option value="'+safe(value)+'"'+((record?.icon||"box")===value?" selected":"")+'>'+safe(label)+'</option>').join("");
  $("taxonomyModalFields").innerHTML='<label for="taxonomyName">Category name</label><input id="taxonomyName" name="name" maxlength="60" required placeholder="Category name" value="'+safe(record?.name||"")+'"><label for="taxonomyIcon">Sidebar icon</label><select id="taxonomyIcon" name="icon">'+options+'</select>';
 }else{
  $("taxonomyModalFields").innerHTML='<label for="taxonomyName">Tag name</label><input id="taxonomyName" name="name" maxlength="40" required placeholder="Tag name" value="'+safe(record?.name||"")+'">';
 }
 $("taxonomyModalMessage").textContent="";$("taxonomyModalMessage").classList.remove("error");
 $("taxonomyModalSave").disabled=false;$("taxonomyModalCancel").disabled=false;
 $("taxonomyModalSave").textContent=isNew?"Create":"Save changes";
 $("taxonomyModalBackdrop").hidden=false;$("taxonomyModalBackdrop").setAttribute("aria-hidden","false");
 $("taxonomyName").focus();
}
function closeAppConfirm(value=false){
 const modal=$("appConfirmModal");
 if(modal){modal.hidden=true;modal.setAttribute("aria-hidden","true")}
 if(state.confirmResolver){const resolve=state.confirmResolver;state.confirmResolver=null;resolve(!!value)}
}
function confirmInApp({title="Confirm action",message="",confirmLabel="Continue",danger=true}={}){
 if(state.confirmResolver)closeAppConfirm(false);
 $("appConfirmTitle").textContent=title;$("appConfirmMessage").textContent=message;
 $("appConfirmAccept").textContent=confirmLabel;$("appConfirmAccept").className=danger?"danger-button":"primary";
 $("appConfirmModal").hidden=false;$("appConfirmModal").setAttribute("aria-hidden","false");
 $("appConfirmCancel").focus();
 return new Promise(resolve=>{state.confirmResolver=resolve});
}
async function saveTaxonomyModal(event){
 event?.preventDefault();
 if(!state.taxonomyModalType)return;
 const type=state.taxonomyModalType,id=state.taxonomyModalId,isNew=id==null,isCategory=type==="category",returnToService=state.taxonomyReturnToService;
 const name=$("taxonomyName").value.trim();
 if(!name){$("taxonomyModalMessage").textContent="Enter a name.";return}
 const payload={name};if(isCategory)payload.icon=$("taxonomyIcon").value;
 const endpoint=(isCategory?"categories-manage":"tags")+(isNew?"":"?id="+encodeURIComponent(id));
 $("taxonomyModalSave").disabled=true;$("taxonomyModalCancel").disabled=true;
 $("taxonomyModalMessage").textContent=isNew?"Creating…":"Saving…";
 try{
  await apiRequest(endpoint,{method:isNew?"POST":"PUT",body:JSON.stringify(payload)});
  if(isCategory&&state.page==="category"&&state.current===state.taxonomyModalOriginalName)state.current=name;
  if(type==="tag"&&state.activeTag===state.taxonomyModalOriginalName)state.activeTag=name;
  closeTaxonomyModal();await loadRemoteData();await refreshTaxonomy(false);
  if(returnToService&&isNew&&$("serviceModal")?.classList.contains("open")){
   if(isCategory){$("category").value=name;}
   else{state.serviceSelectedTags.add(name);$("serviceTagSearch").value="";state.serviceTagQuery="";renderServiceTagPicker();}
  }
  toast((isNew?"Added ":"Saved ")+(isCategory?"category":"tag"));
 }catch(error){
  $("taxonomyModalMessage").textContent=error.message||"Could not save changes.";
  $("taxonomyModalMessage").classList.add("error");
 }finally{
  if(!$("taxonomyModalBackdrop").hidden){$("taxonomyModalSave").disabled=false;$("taxonomyModalCancel").disabled=false}
 }
}
function renderCategoryManager(){
const host=$("categoryManagerList");if(!host)return;
if(!state.apiConnected){host.innerHTML='<div class="taxonomy-empty">The shared database is not connected. Category changes cannot be saved.</div>';return}
if(!state.taxonomyLoaded){host.innerHTML='<div class="taxonomy-empty">Loading categories…</div>';return}
const query=($("categoryFilter")?.value||"").trim().toLowerCase();
const shown=state.taxonomyCategories.filter(cat=>!query||cat.name.toLowerCase().includes(query));
if(!shown.length){host.innerHTML='<div class="taxonomy-empty">'+(query?"No categories match this filter.":"No categories yet. Add one above.")+'</div>';return}
host.innerHTML=shown.map(cat=>{
 const id=Number(cat.id),count=Number(cat.serviceCount||cat.service_count||0);
 return '<div class="taxonomy-row taxonomy-overview-row category-manager-item" draggable="'+(!query)+'" data-category-row="'+id+'"><span class="category-drag-handle" title="'+(query?"Clear filter to reorder":"Drag to reorder category")+'" aria-label="Drag to reorder category">⠿</span><div class="taxonomy-overview-main"><span class="taxonomy-overview-icon">'+categorySvg(cat.name)+'</span><div class="taxonomy-overview-copy"><strong>'+safe(cat.name)+'</strong><small>'+safe(cat.icon||"box")+' icon</small></div></div><span class="taxonomy-usage">'+count+' services</span><div class="taxonomy-overview-actions"><button type="button" class="secondary icon-action" data-taxonomy-edit="category" data-taxonomy-id="'+id+'" title="Edit '+safe(cat.name)+'" aria-label="Edit category '+safe(cat.name)+'"><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button><button type="button" class="secondary icon-action taxonomy-danger" data-category-delete="'+id+'" '+(count>0?'disabled title="Move services to another category first"':'title="Delete empty category"')+' aria-label="Delete category '+safe(cat.name)+'"><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg></button></div></div>'
}).join("");
host.querySelectorAll('[data-taxonomy-edit="category"]').forEach(button=>button.onclick=()=>openTaxonomyModal("category",Number(button.dataset.taxonomyId)));
host.querySelectorAll("[data-category-delete]").forEach(button=>button.onclick=async()=>{
 const id=Number(button.dataset.categoryDelete),cat=state.taxonomyCategories.find(c=>Number(c.id)===id);
 if(!cat||Number(cat.serviceCount||cat.service_count||0)>0)return;
 const confirmed=await confirmInApp({title:"Delete category?",message:'Delete the empty category "'+cat.name+'"? This cannot be undone.',confirmLabel:"Delete category"});
 if(!confirmed)return;
 button.disabled=true;taxonomyMessage("categoryManagerMessage","Deleting category…");
 try{
  await apiRequest("categories-manage?id="+id,{method:"DELETE"});
  await loadRemoteData();await refreshTaxonomy(false);state.categoryRecords=state.taxonomyCategories;nav();
  taxonomyMessage("categoryManagerMessage","Empty category deleted.");toast("Category deleted");
 }catch(error){taxonomyMessage("categoryManagerMessage",error.message||"Could not delete category.",true);button.disabled=false}
});
let draggedId=null;
host.querySelectorAll("[data-category-row]").forEach(card=>{
 card.addEventListener("dragstart",event=>{
  if(query){event.preventDefault();return}
  draggedId=Number(card.dataset.categoryRow);card.classList.add("dragging");
  if(event.dataTransfer){event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",String(draggedId))}
 });
 card.addEventListener("dragover",event=>{if(draggedId==null||draggedId===Number(card.dataset.categoryRow)||query)return;event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect="move";card.classList.add("drag-over")});
 card.addEventListener("dragleave",()=>card.classList.remove("drag-over"));
 card.addEventListener("drop",async event=>{
  event.preventDefault();card.classList.remove("drag-over");
  const fromId=draggedId??Number(event.dataTransfer?.getData("text/plain")),toId=Number(card.dataset.categoryRow);draggedId=null;
  if(query||!fromId||fromId===toId)return;
  const order=state.taxonomyCategories.slice().sort((a,b)=>Number(a.sortOrder??a.sort_order??9999)-Number(b.sortOrder??b.sort_order??9999));
  const from=order.findIndex(item=>Number(item.id)===fromId),to=order.findIndex(item=>Number(item.id)===toId);
  if(from<0||to<0)return;
  const [moved]=order.splice(from,1);order.splice(to,0,moved);
  host.querySelectorAll("[data-category-row]").forEach(item=>item.classList.remove("dragging","drag-over"));
  taxonomyMessage("categoryManagerMessage","Saving category order…");
  host.querySelectorAll("button").forEach(button=>button.disabled=true);
  try{
   const result=await apiRequest("categories-manage",{method:"PATCH",body:JSON.stringify({order:order.map(item=>Number(item.id))})});
   state.taxonomyCategories=result;state.categoryRecords=result;nav();renderCategoryManager();
   taxonomyMessage("categoryManagerMessage","Category order saved automatically.");toast("Category order saved");
  }catch(error){taxonomyMessage("categoryManagerMessage",error.message||"Could not save category order.",true);renderCategoryManager()}
 });
 card.addEventListener("dragend",()=>{draggedId=null;host.querySelectorAll("[data-category-row]").forEach(item=>item.classList.remove("dragging","drag-over"))});
});
}
function renderTagManager(){
const host=$("tagManagerList");if(!host)return;
if(!state.apiConnected){host.innerHTML='<div class="taxonomy-empty">The shared database is not connected. Tag changes cannot be saved.</div>';return}
if(!state.taxonomyLoaded){host.innerHTML='<div class="taxonomy-empty">Loading tags…</div>';return}
const query=($("tagFilter")?.value||"").trim().toLowerCase();
const shown=state.tagRecords.filter(tag=>!query||tag.name.toLowerCase().includes(query));
if($("tagManagerCount"))$("tagManagerCount").textContent=state.tagRecords.length+" tags";
if(!shown.length){host.innerHTML='<div class="taxonomy-empty">'+(query?"No tags match this filter.":"No tags yet. Add one above.")+'</div>';return}
host.innerHTML=shown.map(tag=>{
 const id=Number(tag.id),count=Number(tag.serviceCount||0);
 return '<div class="taxonomy-row taxonomy-overview-row taxonomy-tag-overview" data-tag-row="'+id+'"><div class="taxonomy-overview-main"><span class="taxonomy-overview-icon tag-overview-mark">#</span><div class="taxonomy-overview-copy"><strong>'+safe(tag.name)+'</strong><small>Reusable service tag</small></div></div><span class="taxonomy-usage">'+count+' services</span><div class="taxonomy-overview-actions"><button type="button" class="secondary icon-action" data-taxonomy-edit="tag" data-taxonomy-id="'+id+'" title="Edit '+safe(tag.name)+'" aria-label="Edit tag '+safe(tag.name)+'"><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button><button type="button" class="secondary icon-action taxonomy-danger" data-tag-delete="'+id+'" title="Delete tag and remove its assignments" aria-label="Delete tag '+safe(tag.name)+'"><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg></button></div></div>'
}).join("");
host.querySelectorAll('[data-taxonomy-edit="tag"]').forEach(button=>button.onclick=()=>openTaxonomyModal("tag",Number(button.dataset.taxonomyId)));
host.querySelectorAll("[data-tag-delete]").forEach(button=>button.onclick=async()=>{
 const id=Number(button.dataset.tagDelete),tag=state.tagRecords.find(t=>Number(t.id)===id);if(!tag)return;
 const count=Number(tag.serviceCount||0);
 const confirmed=await confirmInApp({title:"Delete tag?",message:'Delete "'+tag.name+'"'+(count?' and remove it from '+count+' service(s)':'')+'? This cannot be undone.',confirmLabel:"Delete tag"});
 if(!confirmed)return;
 button.disabled=true;taxonomyMessage("tagManagerMessage","Deleting tag…");
 try{
  await apiRequest("tags?id="+id,{method:"DELETE"});
  await loadRemoteData();await refreshTaxonomy(false);taxonomyMessage("tagManagerMessage","Tag deleted.");toast("Tag deleted");
 }catch(error){taxonomyMessage("tagManagerMessage",error.message||"Could not delete tag.",true);button.disabled=false}
});
}
async function refreshTaxonomy(showToast=true,profileId=state.currentProfile){
const requestToken=++state.taxonomyLoadToken;state.taxonomyBusy=true;
taxonomyMessage("categoryManagerMessage","Loading categories…");taxonomyMessage("tagManagerMessage","Loading tags…");
try{
const [categoriesResult,tagsResult]=await Promise.all([apiRequest("categories-manage",{},profileId),apiRequest("tags",{},profileId)]);
if(profileId!==state.currentProfile||requestToken!==state.taxonomyLoadToken)return false;
if(!Array.isArray(categoriesResult)||!Array.isArray(tagsResult))throw new Error("Unexpected category or tag response.");
state.taxonomyCategories=categoriesResult;state.categoryRecords=categoriesResult;state.tagRecords=tagsResult;state.taxonomyLoaded=true;state.dataProfileId=profileId;saveProfileCache(profileId);
taxonomyMessage("categoryManagerMessage",state.taxonomyCategories.length+" categories, including empty sidebar placeholders.");taxonomyMessage("tagManagerMessage",state.tagRecords.length+" tags in the "+(profileId===1?"Personal":"Work")+" profile.");
}catch(error){if(profileId!==state.currentProfile||requestToken!==state.taxonomyLoadToken)return false;taxonomyMessage("categoryManagerMessage",error.message||"Could not load categories.",true);taxonomyMessage("tagManagerMessage",error.message||"Could not load tags.",true);state.taxonomyLoaded=false}
finally{if(requestToken===state.taxonomyLoadToken)state.taxonomyBusy=false}
nav();renderCategoryManager();renderTagManager();
const accessCategory=$("accessSyncCategory");
if(accessCategory){const selectedCurrent=accessCategory.value;const names=[...new Set(state.taxonomyCategories.map(c=>c.name))].sort((a,b)=>a.localeCompare(b));accessCategory.replaceChildren(...names.map(name=>{const option=document.createElement("option");option.value=name;option.textContent=name;return option}));accessCategory.value=names.includes(selectedCurrent)?selectedCurrent:(names.includes("Infrastructure")?"Infrastructure":names[0]||"")}
if($("serviceModal")?.classList.contains("open")){
 const categorySelect=$("category"),selectedCategory=categorySelect.value;
 const names=categories().filter(name=>name!=="All");
 categorySelect.replaceChildren(...names.map(name=>{const option=document.createElement("option");option.value=name;option.textContent=name;return option}));
 categorySelect.value=names.includes(selectedCategory)?selectedCategory:(names[0]||"");
 renderServiceTagPicker();
}
if(state.page==="admin")renderAdminPage();else if(state.page==="all"||state.page==="category"||state.page==="tag"||state.page==="favorites")renderCatalog();
if(showToast)toast(state.taxonomyLoaded?"Categories and tags refreshed":"Could not load categories and tags");
}

export { taxonomyMessage, closeTaxonomyModal, openTaxonomyModal, closeAppConfirm, confirmInApp, saveTaxonomyModal, renderCategoryManager, renderTagManager, refreshTaxonomy };
