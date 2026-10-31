/* Anchor Dashboard - catalog rendering: navigation, cards, list, dots, search, ordering. */
import { $, safe } from "../core/dom.js";
import { categorySvg, categoryTone, serviceIconHtml, svg } from "../icons.js";
import { state } from "../state.js";
import { discardUncommittedBrandingLogo } from "./images.js";
import { hydrateAssetImages } from "./image-cache.js";
import { apiRequest, remoteSaveService } from "./api.js";
import { categories, saveProfileCache, toast } from "./persistence.js";
import { confirmInApp } from "./taxonomy.js";
import { render } from "./admin.js";
import { openModal } from "./editor.js";
import { highlight, scoreService, searchCategories, searchServices, searchTags, tokenize } from "./search.js";
import { clearUsage, mostUsedServices, recentlyUsedServices, recordServiceUse, usageSummary } from "./usage.js";

function currentQuery(){return $("search").value.trim()}
function matchesSearch(s){const query=currentQuery();return !query||!!scoreService(s,tokenize(query))}
function orderedFavoriteItems(items=state.services.filter(s=>s.favorite)){const rank=new Map((state.favoritesOrder||[]).map((id,index)=>[Number(id),index]));return items.slice().sort((a,b)=>{const ai=rank.has(Number(a.id))?rank.get(Number(a.id)):Number.MAX_SAFE_INTEGER,bi=rank.has(Number(b.id))?rank.get(Number(b.id)):Number.MAX_SAFE_INTEGER;return ai-bi||Number(a.sort_order??a.id)-Number(b.sort_order??b.id)||Number(a.id)-Number(b.id)})}function byName(a,b){return String(a.name||"").localeCompare(String(b.name||""),undefined,{sensitivity:"base",numeric:true})}
function byCategoryOrder(a,b){return (Number(a.categorySortOrder)||9999)-(Number(b.categorySortOrder)||9999)||Number(a.id)-Number(b.id)}
function usageRankMap(entries){return new Map(entries.map((entry,index)=>[String(entry.service.id),index]))}
// Sorting pauses while edit/reorder mode is on: a moving comparator would fight
// drag-and-drop targets between renders.
function sortServices(items){
 if(state.reorderEnabled||state.sortMode==="default")return items;
 if(state.sortMode==="name")return items.slice().sort(byName);
 if(state.sortMode==="used"){const rank=usageRankMap(mostUsedServices(Number.MAX_SAFE_INTEGER));return items.slice().sort((a,b)=>{const ai=rank.has(String(a.id))?rank.get(String(a.id)):Number.MAX_SAFE_INTEGER,bi=rank.has(String(b.id))?rank.get(String(b.id)):Number.MAX_SAFE_INTEGER;return ai-bi||byName(a,b)})}
 if(state.sortMode==="recent"){const rank=usageRankMap(recentlyUsedServices(Number.MAX_SAFE_INTEGER));return items.slice().sort((a,b)=>{const ai=rank.has(String(a.id))?rank.get(String(a.id)):Number.MAX_SAFE_INTEGER,bi=rank.has(String(b.id))?rank.get(String(b.id)):Number.MAX_SAFE_INTEGER;return ai-bi||byName(a,b)})}
 return items;
}
function filtered(){
 const query=currentQuery(),globalSearch=!!query;
 const scoped=state.services.filter(s=>(globalSearch?true:state.page==="favorites"?s.favorite:state.page==="category"?s.category===state.current:state.page==="tag"?(s.tags||[]).includes(state.activeTag):true)&&matchesSearch(s));
 // Global search is always ranked by relevance; every other page keeps its own order.
 if(globalSearch)return searchServices(scoped,query).map(entry=>entry.service);
 if(state.page==="all")return sortServices(scoped.slice().sort(byName));
 if(state.page==="favorites")return sortServices(orderedFavoriteItems(scoped));
 if(state.page==="category")return sortServices(scoped.slice().sort(byCategoryOrder));
 return sortServices(scoped);
}
function tagHtml(t){return '<span class="tag">'+safe(t)+'</span>'}
function updateActiveNavigation(){document.querySelectorAll(".nav[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===state.page));document.querySelectorAll(".nav[data-cat]").forEach(b=>b.classList.toggle("active",state.page==="category"&&b.dataset.cat===state.current));document.querySelectorAll(".nav[data-tag-nav]").forEach(b=>b.classList.toggle("active",state.page==="tag"&&b.dataset.tagNav===state.activeTag))}
function nav(){
const allServicesCount=$("allServicesCount"),favoritesCount=$("favoritesCount");if(allServicesCount)allServicesCount.textContent=String(state.services.length);if(favoritesCount)favoritesCount.textContent=String(state.services.filter(item=>item.favorite).length);
const host=$("categoryNav"),moreCategories=$("showMoreCategories");
const allCategories=categories().filter(category=>category!=="All");
const emptyCategories=allCategories.filter(category=>!state.services.some(item=>item.category===category));
const visibleCategories=state.sidebarCategoriesExpanded?allCategories:allCategories.filter(category=>state.services.some(item=>item.category===category));
host.innerHTML=visibleCategories.map(category=>'<button class="nav" data-cat="'+safe(category)+'" style="--nav-tone:'+categoryTone(category)[0]+';--nav-wash:'+categoryTone(category)[1]+'" title="'+safe(category)+'"><span class="ico">'+categorySvg(category)+'</span><span>'+safe(category)+'</span><span class="count">'+state.services.filter(item=>item.category===category).length+'</span></button>').join("");
host.querySelectorAll("[data-cat]").forEach(button=>button.onclick=()=>navigateCategory(button.dataset.cat));
moreCategories.hidden=emptyCategories.length===0;
moreCategories.textContent=state.sidebarCategoriesExpanded?"Show fewer categories":"Show all categories ("+emptyCategories.length+" empty)";
moreCategories.onclick=()=>{state.sidebarCategoriesExpanded=!state.sidebarCategoriesExpanded;nav()};
const tagsHost=$("tagNav"),moreTags=$("showMoreTags");
const sortedTags=state.tagRecords.slice().sort((a,b)=>(Number(b.serviceCount)||0)-(Number(a.serviceCount)||0)||a.name.localeCompare(b.name));
const visibleTags=state.sidebarTagsExpanded?sortedTags:sortedTags.slice(0,5);
tagsHost.innerHTML=visibleTags.map(tag=>'<button class="nav tag-filter-nav" data-tag-nav="'+safe(tag.name)+'" title="Filter by tag: '+safe(tag.name)+'"><span class="tag-nav-mark" aria-hidden="true">#</span><span class="tag-sidebar-name">'+safe(tag.name)+'</span><span class="count">'+Number(tag.serviceCount||0)+'</span></button>').join("");
tagsHost.querySelectorAll("[data-tag-nav]").forEach(button=>button.onclick=()=>navigateTag(button.dataset.tagNav));
moreTags.hidden=sortedTags.length<=5;
moreTags.textContent=state.sidebarTagsExpanded?"Show fewer tags":"Show all tags ("+sortedTags.length+")";
moreTags.onclick=()=>{state.sidebarTagsExpanded=!state.sidebarTagsExpanded;nav()};
const categoriesCollapsed=!!state.preferences.sidebarCategoriesCollapsed,tagsCollapsed=!!state.preferences.sidebarTagsCollapsed;
$("categorySectionContent").hidden=categoriesCollapsed;
$("tagSectionContent").hidden=tagsCollapsed;
$("toggleCategoriesSection").setAttribute("aria-expanded",categoriesCollapsed?"false":"true");
$("toggleCategoriesSection").querySelector(".sidebar-section-chevron").textContent=categoriesCollapsed?"›":"⌄";
$("toggleCategoriesSection").title=categoriesCollapsed?"Expand categories":"Collapse categories";
$("toggleTagsSection").setAttribute("aria-expanded",tagsCollapsed?"false":"true");
$("toggleTagsSection").querySelector(".sidebar-section-chevron").textContent=tagsCollapsed?"›":"⌄";
$("toggleTagsSection").title=tagsCollapsed?"Expand tags":"Collapse tags";
updateActiveNavigation()
}
function showPage(){["catalogPage","adminPage","settingsPage"].forEach(id=>$(id).hidden=true);const target=state.page==="settings"?"settingsPage":state.page==="admin"?"adminPage":"catalogPage";$(target).hidden=false;updateActiveNavigation()}
function navigatePage(target){if(state.page==="settings"&&target!=="settings")discardUncommittedBrandingLogo();$("search").value="";state.searchReturnPage=null;state.page=target;state.activeTag=null;if(target==="favorites")state.current="Favorites";else if(target==="home"||target==="all")state.current="All";if(target==="admin")state.adminTab="categories";state.reorderEnabled=false;render()}
function navigateCategory(category){if(state.page==="settings")discardUncommittedBrandingLogo();$("search").value="";state.searchReturnPage=null;state.page="category";state.current=category;state.activeTag=null;state.reorderEnabled=false;render()}
function navigateTag(tag){if(state.page==="settings")discardUncommittedBrandingLogo();$("search").value="";state.searchReturnPage=null;state.page="tag";state.activeTag=tag;state.current="All";state.reorderEnabled=false;render()}
function statCard(label,value,note){return '<article class="stat-card"><div class="stat-label">'+label+'</div><div class="stat-number">'+value+'</div><div class="stat-note">'+note+'</div></article>'}
function serviceActionIcon(action,id,name){
const paths={
edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
duplicate:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4"/>',
delete:'<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/>'
};
const labels={edit:"Edit",duplicate:"Duplicate",delete:"Delete"};
return '<button type="button" class="secondary icon-action" data-'+action+'="'+safe(id)+'" title="'+labels[action]+' '+safe(name)+'" aria-label="'+labels[action]+' '+safe(name)+'"><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true">'+paths[action]+'</svg></button>';
}
function renderServiceCards(items,manage,allowReorder=false){
if(!items.length)return '<div class="empty">No services match this view. Try another search or category.</div>';
const queryActive=!!$("search").value.trim(),slim=state.density==="slim",orderable=!queryActive&&(!!allowReorder||!!manage&&state.page==="category");
return '<div class="grid '+(slim?"slim":"")+'">'+items.map(s=>{
const category=queryActive?'<div class="service-card-category"><span class="service-card-category-prefix">Category</span><span class="service-card-category-value">'+safe(s.category)+'</span></div>':slim?"":'<div class="service-desc" style="margin:2px 0 0;min-height:0">'+safe(s.category)+'</div>';
const description=state.preferences.showCardDescriptions&&s.description?'<div class="service-desc '+(slim?"slim-card-description":"")+'">'+safe(s.description)+'</div>':"";
const details=description+(slim?"":'<div class="tags">'+(s.tags||[]).map(tagHtml).join("")+'</div>');
const actions=manage?'<span class="manage-actions">'+serviceActionIcon("edit",s.id,s.name)+serviceActionIcon("duplicate",s.id,s.name)+serviceActionIcon("delete",s.id,s.name)+'</span>':"";
const actionRow=manage?'<div class="card-actions '+(slim?"slim-card-actions":"")+'">'+actions+'</div>':"";
const dragHandle=orderable?'<button type="button" class="service-card-drag-handle" data-order-drag="'+safe(s.id)+'" draggable="true" title="Drag to reorder" aria-label="Drag to reorder '+safe(s.name)+'">⠿</button>':"";
return '<article class="card '+(slim?"slim-card ":"")+(orderable?"orderable-card":"")+'" data-order-id="'+safe(s.id)+'" data-open="'+safe(s.id)+'"><div class="card-top">'+dragHandle+'<div class="service-icon">'+serviceIconHtml(s)+'</div><div class="slim-card-identity" style="min-width:0"><div class="service-title">'+highlight(s.name,queryActive?currentQuery():"")+'</div>'+category+'</div><button class="star" data-fav="'+safe(s.id)+'" title="Toggle favorite" aria-label="Toggle favorite for '+safe(s.name)+'">'+(s.favorite?"★":"☆")+'</button></div>'+details+actionRow+'</article>';
}).join("")+'</div>';
}
function renderServiceDots(items,manage=false,allowReorder=false){
if(!items.length)return '<div class="empty">No services match this view. Try another search or category.</div>';
const queryActive=!!$("search").value.trim(),orderable=!!allowReorder&&!queryActive;
return '<div class="service-dot-grid">'+items.map(s=>{
const actions=manage?'<div class="service-dot-actions">'+serviceActionIcon("edit",s.id,s.name)+serviceActionIcon("duplicate",s.id,s.name)+serviceActionIcon("delete",s.id,s.name)+'</div>':"";
const category=queryActive?'<span class="service-dot-category"><span>Category</span> '+safe(s.category)+'</span>':"";
const description=state.preferences.showCardDescriptions&&s.description?'<span class="service-dot-description">'+safe(s.description)+'</span>':"";
const dragHandle=orderable?'<button type="button" class="service-card-drag-handle service-dot-drag-handle" data-order-drag="'+safe(s.id)+'" draggable="true" title="Drag to reorder favorites" aria-label="Drag to reorder '+safe(s.name)+'">⠿</button>':"";
return '<article class="service-dot-card '+(orderable?"orderable-card":"")+'" data-order-id="'+safe(s.id)+'" data-open="'+safe(s.id)+'" tabindex="0" aria-label="Open service '+safe(s.name)+'" title="Open '+safe(s.name)+'">'+dragHandle+'<button type="button" class="service-dot-favorite" data-fav="'+safe(s.id)+'" title="'+(s.favorite?"Remove from":"Add to")+' favorites" aria-label="'+(s.favorite?"Remove from":"Add to")+' favorites: '+safe(s.name)+'">'+(s.favorite?"★":"☆")+'</button><div class="service-dot-icon">'+serviceIconHtml(s)+'</div><span class="service-dot-label">'+highlight(s.name,queryActive?currentQuery():"")+'</span>'+category+description+actions+'</article>';
}).join("")+'</div>';
}
function renderServiceTable(items,manage,orderable=false){
if(!items.length)return '<div class="empty">No services in this view. Choose a category from the sidebar.</div>';
const canDrag=!!orderable&&!$("search").value.trim()&&((state.page==="category"&&!!manage)||(state.page==="favorites"&&state.reorderEnabled));
return '<table><thead><tr><th>Service</th><th>Category</th><th>Tags</th><th>URL</th><th>Actions</th></tr></thead><tbody>'+items.map(s=>{
const handle=canDrag?'<button type="button" class="service-card-drag-handle table-drag-handle" data-order-drag="'+safe(s.id)+'" draggable="true" title="Drag to reorder '+(state.page==="favorites"?"favorites":"within "+safe(state.current))+'" aria-label="Drag to reorder '+safe(s.name)+'">⠿</button>':"";
const action=manage?serviceActionIcon("edit",s.id,s.name)+serviceActionIcon("duplicate",s.id,s.name)+serviceActionIcon("delete",s.id,s.name):'<button class="secondary" data-fav="'+safe(s.id)+'" title="'+(s.favorite?"Remove from favorites":"Add to favorites")+'" aria-label="'+(s.favorite?"Remove from favorites: ":"Add to favorites: ")+safe(s.name)+'">'+(s.favorite?"★":"☆")+"</button>";
return '<tr '+(canDrag?'data-order-id="'+safe(s.id)+'" class="orderable-card"':'')+'><td><span class="table-service-icon">'+serviceIconHtml(s)+'</span>'+handle+highlight(s.name,$("search").value.trim())+'</td><td>'+highlight(s.category,$("search").value.trim())+'</td><td>'+(s.tags||[]).map(tagHtml).join("")+'</td><td><a href="'+safe(s.url)+'" data-open-link="'+safe(s.id)+'" target="_blank" rel="noopener">Open ↗</a></td><td class="action-cell"><div class="action-group">'+action+'</div></td></tr>';
}).join("")+'</tbody></table>';
}
let quickRows=[];
function openServiceById(id){
 const service=state.services.find(item=>String(item.id)===String(id));
 if(!service)return;
 recordServiceUse(service);
 window.open(service.url,"_blank","noopener");
 // Home shows the Most used strip, so refresh it as soon as a service is opened.
 if(state.page==="favorites")renderMostUsed(true);
}
function groupKeyOf(service){return state.groupBy==="tag"?((service.tags||[])[0]||"Untagged"):(service.category||"Uncategorized")}
function renderGrouped(items,renderer){
 const groups=new Map();
 for(const item of items){const key=groupKeyOf(item);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item)}
 return [...groups.entries()].sort((a,b)=>String(a[0]).localeCompare(String(b[0]),undefined,{sensitivity:"base",numeric:true})).map(([key,list])=>'<section class="catalog-group"><header class="catalog-group-head"><h2>'+safe(key)+'</h2><span class="catalog-group-count">'+list.length+'</span></header>'+renderer(list)+'</section>').join("");
}
function renderMostUsed(visible){
 const host=$("mostUsedArea");if(!host)return;
 const entries=visible?mostUsedServices(6):[];
 if(!entries.length){host.hidden=true;host.replaceChildren();return}
 const summary=usageSummary();
 host.innerHTML='<div class="most-used-head"><h2>Most used</h2><span class="most-used-note">'+summary.opens+' opens tracked on this device</span><button type="button" class="most-used-clear" id="clearMostUsed">Reset</button></div><div class="most-used-row">'+entries.map(({service,count})=>'<button type="button" class="most-used-card" data-used-open="'+safe(service.id)+'" title="Open '+safe(service.name)+'"><span class="most-used-icon">'+serviceIconHtml(service)+'</span><span class="most-used-copy"><span class="most-used-name">'+safe(service.name)+'</span><span class="most-used-meta">'+safe(service.category||"")+'</span></span><span class="most-used-count" title="Opens on this device">'+count+'</span></button>').join("")+'</div>';
 host.hidden=false;
 const clear=$("clearMostUsed");
 if(clear)clear.onclick=()=>{clearUsage();render();toast("Most used tracking reset for this profile")};
 host.querySelectorAll("[data-used-open]").forEach(button=>button.onclick=()=>openServiceById(button.dataset.usedOpen));
 hydrateAssetImages(host);
}
function quickRowData(query){
 const ranked=searchServices(state.services,query);
 const rows=ranked.slice(0,5).map(entry=>({type:"service",id:entry.service.id,label:entry.service.name,meta:entry.service.category||"",field:entry.field,service:entry.service}));
 for(const hit of searchCategories(query).slice(0,3))rows.push({type:"category",value:hit.name,label:hit.name,meta:hit.count+" services",field:"category"});
 for(const hit of searchTags(query).slice(0,3))rows.push({type:"tag",value:hit.name,label:"#"+hit.name,meta:hit.count+" tagged",field:"tag"});
 return {rows,total:ranked.length};
}
function renderQuickResults(){
 const host=$("quickResults");if(!host)return;
 const query=currentQuery();
 if(!query){quickRows=[];state.quickIndex=-1;state.quickOpen=false;host.hidden=true;host.replaceChildren();$("search").setAttribute("aria-expanded","false");return}
 const {rows,total}=quickRowData(query);
 quickRows=rows;
 if(!rows.length){state.quickIndex=-1;host.innerHTML='<div class="quick-empty">No services, categories, or tags match "'+safe(query)+'".</div>';host.hidden=false;state.quickOpen=true;$("search").setAttribute("aria-expanded","true");return}
 if(state.quickIndex>=rows.length)state.quickIndex=-1;
 const labels={name:"name",category:"category",tag:"tag",description:"description",url:"URL"};
 let markup='<div class="quick-results-head"><span>Search results</span><span>'+total+' service'+(total===1?"":"s")+'</span></div><div class="quick-results-list" role="listbox" aria-label="Quick results">';
 let previousType="";
 rows.forEach((row,index)=>{
  if(row.type!==previousType){previousType=row.type;markup+='<div class="quick-group-label">'+(row.type==="service"?"Services":row.type==="category"?"Categories":"Tags")+'</div>'}
  const selected=index===state.quickIndex;
  const icon=row.type==="service"?serviceIconHtml(row.service):'<span class="quick-glyph">'+(row.type==="tag"?"#":categorySvg(row.value))+'</span>';
  markup+='<button type="button" class="quick-result'+(selected?" selected":"")+'" role="option" aria-selected="'+(selected?"true":"false")+'" data-quick-index="'+index+'"><span class="quick-result-icon">'+icon+'</span><span class="quick-result-copy"><span class="quick-result-label">'+highlight(row.label,query)+'</span><span class="quick-result-meta">'+safe(row.meta)+(row.type==="service"&&labels[row.field]?" · matched in "+labels[row.field]:"")+'</span></span>'+(row.type==="service"?'<span class="quick-result-enter">↵</span>':"")+'</button>';
 });
 markup+='</div><div class="quick-results-foot"><span>↑↓ move · Enter open · Esc close</span><span>Ctrl K</span></div>';
 host.innerHTML=markup;
 host.hidden=false;state.quickOpen=true;$("search").setAttribute("aria-expanded","true");
 host.querySelectorAll("[data-quick-index]").forEach(button=>{
  button.onmouseenter=()=>{state.quickIndex=Number(button.dataset.quickIndex);highlightQuickRow()};
  button.onclick=()=>activateQuickRow(Number(button.dataset.quickIndex));
 });
}
function highlightQuickRow(){
 const host=$("quickResults");if(!host||host.hidden)return;
 host.querySelectorAll("[data-quick-index]").forEach(button=>{const selected=Number(button.dataset.quickIndex)===state.quickIndex;button.classList.toggle("selected",selected);button.setAttribute("aria-selected",selected?"true":"false")});
 const active=host.querySelector("[data-quick-index].selected");
 if(active&&active.scrollIntoView)active.scrollIntoView({block:"nearest"});
}
function activateQuickRow(index){
 const row=quickRows[index];
 if(!row)return;
 closeQuickResults();
 if(row.type==="service")openServiceById(row.id);
 else if(row.type==="category")navigateCategory(row.value);
 else navigateTag(row.value);
}
function moveQuickSelection(step){
 if(!quickRows.length)return;
 const size=quickRows.length;
 state.quickIndex=(state.quickIndex+step+size)%size;
 $("search").setAttribute("aria-activedescendant","quick-result-"+state.quickIndex);
 highlightQuickRow();
}
function handleSearchKeydown(event){
 if(event.key==="ArrowDown"){event.preventDefault();moveQuickSelection(1);return}
 if(event.key==="ArrowUp"){event.preventDefault();moveQuickSelection(-1);return}
 if(event.key==="Enter"){if(state.quickIndex>=0){event.preventDefault();activateQuickRow(state.quickIndex)}else if(quickRows.length){event.preventDefault();activateQuickRow(0)}return}
 if(event.key==="Escape"){event.preventDefault();closeQuickResults();$("search").value="";render();$("search").focus();}
}
function closeQuickResults(){
 const host=$("quickResults");
 state.quickOpen=false;state.quickIndex=-1;quickRows=[];
 if(host){host.hidden=true;host.replaceChildren()}
 if($("search"))$("search").setAttribute("aria-expanded","false");
}
function renderCatalog(){
const queryActive=!!$("search").value.trim();
const items=filtered(),isCategory=state.page==="category",isFavorites=state.page==="favorites",isTag=state.page==="tag",isAll=state.page==="all";
$("catalogEyebrow").textContent=queryActive?"SEARCH RESULTS":isFavorites?"WORKSPACE / HOME":isAll?"WORKSPACE / ALL SERVICES":isTag?"TAG FILTER / CATALOG":"SERVICE CATEGORY / MANAGEMENT";
$("heading").textContent=queryActive?"Search Results":isFavorites?"Welcome back":isAll?"All services":isTag?"Tag: "+state.activeTag:state.current+" Services";
$("catalogDescription").textContent=queryActive?(items.length?("Ranked matches for \""+currentQuery()+"\": "+items.length+" service"+(items.length===1?"":"s")+" across this profile."):("No service, category, or tag matches \""+currentQuery()+"\" in this profile.")):isFavorites?"Your favorite services, all in one place.":isAll?"Browse every service in this profile.":isTag?'Services tagged "'+state.activeTag+'". Use Edit mode to edit, duplicate, or delete matching services.':"Browse services in "+state.current+". Use Edit mode to add, edit, duplicate, delete, or reorder services in this category.";
$("add").hidden=!(isCategory&&state.reorderEnabled&&!queryActive);
$("add").textContent="＋ Add service";
const tagFilters=state.tagRecords.filter(tag=>Number(tag.serviceCount??tag.service_count??0)>0).slice().sort((a,b)=>(Number(b.serviceCount??b.service_count)||0)-(Number(a.serviceCount??a.service_count)||0)||a.name.localeCompare(b.name));
const filterOptions=[...(isFavorites?[]:[{label:"Favorites",value:"Favorites",type:"favorites"}]),...tagFilters.map(tag=>({label:tag.name,value:"tag:"+tag.name,type:"tag"}))];
$("chips").innerHTML=filterOptions.map(option=>{
const active=!queryActive&&(option.type==="favorites"?isFavorites:(isTag&&state.activeTag===option.label));
return '<button class="chip '+(active?"active":"")+'" data-chip="'+safe(option.value)+'"'+(option.type==="tag"?' aria-label="Filter by tag '+safe(option.label)+'"':"")+'>'+(option.type==="tag"?'<span class="tag-chip-mark" aria-hidden="true">#</span>':"")+safe(option.label)+'</button>';
}).join("");
const groupSummary=state.groupBy==="none"||queryActive||state.reorderEnabled?"":" · Grouped by "+state.groupBy;
const sortSummary=state.sortMode==="default"?"":" · "+({name:"A–Z",used:"Most used",recent:"Recently opened"}[state.sortMode]||"");
const countSummary=queryActive?" · "+items.length+" match"+(items.length===1?"":"es"):" · "+items.length+" service"+(items.length===1?"":"s");
const filterSummary=queryActive?"Global search":isFavorites?"Home":isTag?"# "+state.activeTag:"All tags";
const layoutSummary=state.view==="list"?"Compact list":state.view==="dots"?"Dot mode":state.density==="slim"?"Slim cards":"Regular cards";
$("catalogControlsSummary").textContent=filterSummary+countSummary+groupSummary+sortSummary+" · "+layoutSummary;
const controlsPanel=$("catalogControlsPanel"),controlsToggle=$("catalogControlsToggle");
controlsPanel.classList.toggle("expanded",state.catalogControlsExpanded);
controlsPanel.setAttribute("aria-hidden",state.catalogControlsExpanded?"false":"true");
controlsToggle.setAttribute("aria-expanded",state.catalogControlsExpanded?"true":"false");
controlsToggle.classList.toggle("active",state.catalogControlsExpanded);
$("chips").querySelectorAll("[data-chip]").forEach(b=>b.onclick=()=>{
const value=b.dataset.chip;
if(value==="Favorites"){$("search").value="";navigatePage("favorites")}
else if(value.startsWith("tag:")){$("search").value="";navigateTag(value.slice(4))}
});
$("regularBtn").classList.toggle("active",state.density==="regular");
$("slimBtn").classList.toggle("active",state.density==="slim");
$("regularBtn").setAttribute("aria-pressed",state.density==="regular"?"true":"false");
$("slimBtn").setAttribute("aria-pressed",state.density==="slim"?"true":"false");$("dotsBtn").classList.toggle("active",state.view==="dots");$("dotsBtn").setAttribute("aria-pressed",state.view==="dots"?"true":"false");
$("cardsBtn").classList.toggle("active",state.view==="cards");
$("listBtn").classList.toggle("active",state.view==="list");
$("cardsBtn").setAttribute("aria-pressed",state.view==="cards"?"true":"false");
$("listBtn").setAttribute("aria-pressed",state.view==="list"?"true":"false");
const densityControl=$("regularBtn").parentElement;
densityControl.style.display=state.view==="cards"?"flex":"none";
$("cardArea").style.display=state.view==="cards"?"block":"none";
$("listArea").style.display=state.view==="list"?"block":"none";$("dotArea").style.display=state.view==="dots"?"block":"none";
$("reorderControl").hidden=!((isCategory||isTag||isFavorites)&&!queryActive);
$("reorderToggle").classList.toggle("active",state.reorderEnabled);
$("reorderToggle").setAttribute("aria-pressed",state.reorderEnabled?"true":"false");
$("reorderToggle").innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M12.8 3.2 16.8 7.2M3 17l4-.9 9.8-9.8a2.1 2.1 0 0 0-3-3L4 13.1 3 17Z"/><path d="M10.5 4.5 14.5 8.5"/></svg><span>'+(state.reorderEnabled?(isFavorites?"Done reordering":"Done editing"):(isFavorites?"Reorder favorites":"Edit mode"))+'</span>';
$("reorderToggle").title=isFavorites?"Drag favorites to set your preferred order":isTag?"Edit, duplicate, or delete services tagged "+state.activeTag:"Edit services in "+state.current+"; add, edit, duplicate, delete, or drag to reorder";
const canManageServices=(isCategory||isTag)&&state.reorderEnabled&&!queryActive,canReorderFavorites=isFavorites&&state.reorderEnabled&&!queryActive;
const groupable=state.groupBy!=="none"&&!queryActive&&!state.reorderEnabled;
const cardsFor=list=>renderServiceCards(list,canManageServices,canReorderFavorites);
const listFor=list=>renderServiceTable(list,canManageServices,(isCategory&&state.reorderEnabled)||canReorderFavorites);
const dotsFor=list=>renderServiceDots(list,canManageServices,canReorderFavorites);
$("cardArea").innerHTML=state.view==="cards"?(groupable?renderGrouped(items,cardsFor):cardsFor(items)):"";
$("listArea").innerHTML=state.view==="list"?(groupable?renderGrouped(items,listFor):listFor(items)):"";
$("dotArea").innerHTML=state.view==="dots"?(groupable?renderGrouped(items,dotsFor):dotsFor(items)):"";
renderMostUsed(isFavorites&&!queryActive);
$("listArea").classList.toggle("service-order-host",(isCategory||isFavorites)&&state.reorderEnabled&&state.view==="list");
}
function bindRenderedActions(){
document.querySelectorAll("[data-fav]").forEach(b=>b.onclick=async e=>{e.stopPropagation();const s=state.services.find(item=>String(item.id)===String(b.dataset.fav));if(!s)return;const changed={...s,favorite:!s.favorite};try{if(state.apiConnected){const saved=await remoteSaveService(changed,false);Object.assign(s,saved)}else{s.favorite=changed.favorite;toast("Favorite changed locally only")}render()}catch(error){toast("Could not save favorite: "+(error.message||"database error"))}});
document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=e=>{e.stopPropagation();openModal(b.dataset.edit)});
document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async e=>{e.stopPropagation();const id=b.dataset.delete;const item=state.services.find(record=>String(record.id)===String(id));if(!item)return;const confirmed=await confirmInApp({title:"Delete service?",message:'Delete "'+item.name+'"? This cannot be undone.',confirmLabel:"Delete service"});if(!confirmed)return;try{if(state.apiConnected)await apiRequest("services?id="+encodeURIComponent(id),{method:"DELETE"});state.services=state.services.filter(record=>String(record.id)!==String(id));render();toast(state.apiConnected?"Service deleted":"Service deleted locally only")}catch(error){toast("Could not delete service: "+(error.message||"database error"))}});
document.querySelectorAll("[data-duplicate]").forEach(b=>b.onclick=async e=>{e.stopPropagation();const s=state.services.find(item=>String(item.id)===String(b.dataset.duplicate));if(!s)return;const copy={...s,id:state.nextId++,name:s.name+" copy",tags:[...(s.tags||[])],favorite:false};try{if(state.apiConnected){const saved=await remoteSaveService(copy,true);state.services.unshift(saved)}else state.services.unshift(copy);render();toast(state.apiConnected?"Service duplicated":"Duplicate exists locally only")}catch(error){toast("Could not duplicate service: "+(error.message||"database error"))}});
document.querySelectorAll("[data-open-link]").forEach(link=>{link.addEventListener("click",()=>{const s=state.services.find(item=>String(item.id)===String(link.dataset.openLink));if(!s)return;recordServiceUse(s);if(state.page==="favorites")renderMostUsed(true)})});
document.querySelectorAll("[data-open]").forEach(el=>{const openService=()=>openServiceById(el.dataset.open);el.onclick=e=>{if(e.target.closest("a,button"))return;openService()};if(el.classList.contains("service-dot-card"))el.onkeydown=e=>{if(e.target.closest("button"))return;if(e.key==="Enter"||e.key===" "){e.preventDefault();openService()}}});
document.querySelectorAll("[data-category-open]").forEach(b=>b.onclick=()=>navigateCategory(b.dataset.categoryOpen))
bindServiceOrdering();
}
function bindServiceOrdering(){
const queryActive=!!$("search").value.trim(),isFavoritePage=state.page==="favorites";
if((state.page!=="category"&&!isFavoritePage)||!state.reorderEnabled||queryActive)return;
const host=state.view==="cards"?$("cardArea"):state.view==="dots"?$("dotArea"):$("listArea");if(!host)return;
let draggedId=null;
const cards=[...host.querySelectorAll("[data-order-id]")];
const handles=host.querySelectorAll("[data-order-drag]");
handles.forEach(handle=>{
 handle.addEventListener("click",event=>event.stopPropagation());
 handle.addEventListener("dragstart",event=>{
  if(!state.reorderEnabled||$("search").value.trim()){event.preventDefault();return}
  draggedId=Number(handle.dataset.orderDrag);
  handle.closest("[data-order-id]")?.classList.add("dragging");
  if(event.dataTransfer){event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",String(draggedId))}
 });
 handle.addEventListener("dragend",()=>{draggedId=null;host.querySelectorAll("[data-order-id]").forEach(row=>row.classList.remove("dragging","drag-over"))});
});
cards.forEach(card=>{
 card.addEventListener("dragover",event=>{
  if(!state.reorderEnabled||draggedId==null||draggedId===Number(card.dataset.orderId)||$("search").value.trim())return;
  event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect="move";card.classList.add("drag-over");
 });
 card.addEventListener("dragleave",()=>card.classList.remove("drag-over"));
 card.addEventListener("drop",async event=>{
  event.preventDefault();card.classList.remove("drag-over");
  const fromId=draggedId??Number(event.dataTransfer?.getData("text/plain")),toId=Number(card.dataset.orderId);
  draggedId=null;host.querySelectorAll("[data-order-id]").forEach(row=>row.classList.remove("dragging","drag-over"));
  if(!state.reorderEnabled||$("search").value.trim()||!fromId||fromId===toId)return;
  const fromService=state.services.find(item=>Number(item.id)===fromId),toService=state.services.find(item=>Number(item.id)===toId);
  let order=[];
  if(isFavoritePage){
   if(!fromService?.favorite||!toService?.favorite){toast("Only favorite services can be reordered here.");return}
   order=orderedFavoriteItems(state.services.filter(item=>item.favorite)).map(item=>Number(item.id));
  }else{
   const categoryRecord=state.categoryRecords.find(item=>item.name===state.current);
   const categoryId=Number(categoryRecord?.id||fromService?.categoryId);
   if(!categoryId||fromService?.category!==state.current||toService?.category!==state.current){toast("Reordering is limited to the current category.");return}
   order=state.services.filter(item=>item.category===state.current).slice().sort((a,b)=>(Number(a.categorySortOrder)||9999)-(Number(b.categorySortOrder)||9999)||Number(a.id)-Number(b.id)).map(item=>Number(item.id));
  }
  const from=order.indexOf(fromId),to=order.indexOf(toId);if(from<0||to<0)return;
  const [moved]=order.splice(from,1);order.splice(to,0,moved);
  if(isFavoritePage){
   const previous=state.favoritesOrder.slice();
   const status=$("serviceOrderStatus");if(status)status.textContent="Saving Favorites order…";
   try{
    if(state.apiConnected){
     const result=await apiRequest("favorites-order",{method:"PUT",body:JSON.stringify({order})});
     if(!Array.isArray(result.order)||result.order.map(Number).join(",")!==order.join(","))throw new Error("The server returned an invalid Favorites order.");
     state.favoritesOrder=result.order.map(Number);saveProfileCache(state.currentProfile);render();toast("Favorites order saved");
    }else{state.favoritesOrder=order.slice();saveProfileCache(state.currentProfile);render();toast("Favorites order changed locally only; database is unavailable")}
   }catch(error){state.favoritesOrder=previous;render();toast("Could not save Favorites order: "+(error.message||"database error"))}
   return;
  }
  const previous=state.services.map(item=>({...item}));
  const status=$("serviceOrderStatus");if(status)status.textContent="Saving category order…";
  try{
   if(state.apiConnected){
    const categoryRecord=state.categoryRecords.find(item=>item.name===state.current),categoryId=Number(categoryRecord?.id||fromService?.categoryId);
    const result=await apiRequest("services",{method:"PATCH",body:JSON.stringify({scope:"category",categoryId,order})});
    if(!Array.isArray(result))throw new Error("The server returned an invalid category order.");
    const returned=result.map(item=>({...item,id:Number(item.id),favorite:!!item.favorite,tags:Array.isArray(item.tags)?item.tags:[]}));
    const byId=new Map(returned.map(item=>[Number(item.id),item]));state.services=state.services.map(item=>byId.get(Number(item.id))||item);
    render();toast("Category service order saved");
   }else{
    const byId=new Map(order.map((id,index)=>[id,index+1]));
    state.services=state.services.map(item=>item.category===state.current?({...item,categorySortOrder:byId.get(Number(item.id))??item.categorySortOrder}):item);
    render();toast("Category order changed locally only; database is unavailable");
   }
  }catch(error){state.services=previous;render();toast("Could not save category order: "+(error.message||"database error"))}
 });
});
}

export { matchesSearch, orderedFavoriteItems, tagHtml, updateActiveNavigation, nav, showPage, navigatePage, navigateCategory, navigateTag, statCard, serviceActionIcon, renderServiceCards, renderServiceDots, renderServiceTable, renderCatalog, renderQuickResults, handleSearchKeydown, closeQuickResults, bindRenderedActions, bindServiceOrdering };
