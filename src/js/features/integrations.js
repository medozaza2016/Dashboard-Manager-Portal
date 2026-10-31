/* Anchor Dashboard - D1, R2, Pages and Cloudflare Access status cards. */
import { $ } from "../core/dom.js";
import { state } from "../state.js";
import { apiRequest, loadRemoteData } from "./api.js";
import { categories, load, toast } from "./persistence.js";

function renderD1Status(){
const badge=$("d1StatusBadge");if(!badge)return;
badge.className="integration-status "+(state.d1Status.state==="connected"?"status-connected":state.d1Status.state==="offline"?"status-offline":"status-checking");
badge.textContent=state.d1Status.state==="connected"?"Connected":state.d1Status.state==="offline"?"Unavailable":"Checking…";
$("d1StatusMessage").textContent=state.d1Status.message;
$("d1ServiceCount").textContent=state.d1Status.serviceCount==null?"—":String(state.d1Status.serviceCount);
$("d1CategoryCount").textContent=state.d1Status.categoryCount==null?"—":String(state.d1Status.categoryCount);
$("d1TagCount").textContent=state.d1Status.tagCount==null?"—":String(state.d1Status.tagCount);
$("d1LastChecked").textContent=state.d1Status.lastChecked?"Last checked "+state.d1Status.lastChecked.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):"Not checked yet";
}
function setD1Status(state,message,counts={}){
state.d1Status={...state.d1Status,...counts,state,message,lastChecked:new Date()};
renderD1Status();
}
function countTagsInUse(items){return new Set(items.flatMap(s=>Array.isArray(s.tags)?s.tags:[]).map(tag=>String(tag).trim()).filter(Boolean)).size}
function addSafeExternalLink(id,url,label,fallback){
const node=$(id);if(!node)return;
node.replaceChildren();
if(!url){node.textContent=fallback||"Not available in this runtime";return}
try{
const parsed=new URL(url);
const host=parsed.hostname.toLowerCase();
const allowed=parsed.protocol==="https:"&&(host==="github.com"||host.endsWith(".github.com")||host==="pages.dev"||host.endsWith(".pages.dev")||host==="dash.cloudflare.com");
if(!allowed)throw new Error("Unsupported external link");
const link=document.createElement("a");link.href=parsed.href;link.target="_blank";link.rel="noopener noreferrer";link.textContent=label||parsed.href;node.appendChild(link);
}catch{node.textContent=fallback||"Link unavailable"}
}
function renderPagesDeployment(){
const data=state.pagesDeployment.data||{};
const badge=$("pagesApiStatusBadge");if(!badge)return;
badge.className="integration-status "+(state.pagesDeployment.state==="connected"?"status-connected":state.pagesDeployment.state==="offline"?"status-offline":"status-checking");
badge.textContent=state.pagesDeployment.state==="connected"?"Live":state.pagesDeployment.state==="offline"?"Unavailable":"Checking…";
$("pagesApiStatusMessage").textContent=state.pagesDeployment.state==="connected"?"Authenticated deployment metadata loaded.":(data.error||"Could not load deployment metadata.");
addSafeExternalLink("pagesDeploymentUrl",data.deploymentUrl,data.deploymentUrl||"",data.deploymentUrl?"":"Current deployment URL was not exposed by this runtime.");
addSafeExternalLink("pagesProjectUrl",data.projectUrl,data.projectUrl||"https://dashboard-manager-portal.pages.dev","Project URL unavailable");
const branch=[data.environment,data.branch].filter(Boolean).join(" · ");
$("pagesBranch").textContent=branch||"Not reported by this runtime";
const commit=data.commit||null;
$("pagesCommitMessage").textContent=commit?(commit.message||"No commit message"):(data.commitLookupError||"Commit details unavailable");
$("pagesCommitMeta").textContent=commit?("By "+(commit.author||"Unknown author")+(commit.committedAt?" · "+new Date(commit.committedAt).toLocaleString():"")):"";
addSafeExternalLink("pagesCommitSha",commit&&commit.url,commit?((commit.shortSha||commit.sha||"").toString()):"",commit?"Commit link unavailable":(data.commitLookupError||"Commit SHA unavailable"));
$("pagesDeploymentState").textContent=data.deploymentStatus?("Serving this request · "+(data.environment||"environment unknown")):"Not reported by this runtime";
$("pagesDeploymentNote").textContent=data.note||"Commit time is not deployment time. Open Cloudflare deployment history for exact build and deploy timestamps.";
$("pagesDeploymentCheckedAt").textContent=state.pagesDeployment.lastChecked?"Last checked "+state.pagesDeployment.lastChecked.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):"Not checked yet";
}
async function checkPagesDeployment(showToast=true){
const button=$("refreshPagesDeployment");if(button){button.disabled=true;button.textContent="Refreshing…"}
state.pagesDeployment.state="checking";renderPagesDeployment();
try{
const data=await apiRequest("deployment");
if(!data||typeof data!=="object")throw new Error("Unexpected deployment metadata response");
state.pagesDeployment={state:"connected",data,lastChecked:new Date()};
renderPagesDeployment();
if(showToast)toast("Pages deployment details refreshed");
}catch(error){
state.pagesDeployment={state:"offline",data:{error:error.message||"Deployment metadata unavailable."},lastChecked:new Date()};
renderPagesDeployment();
if(showToast)toast("Could not refresh deployment details: "+(error.message||"request failed"));
}finally{if(button){button.disabled=false;button.textContent="Refresh details"}}
}
function renderR2Status(){
const badge=$("r2StatusBadge");if(!badge)return;
badge.className="integration-status "+(state.r2Status.state==="connected"?"status-connected":state.r2Status.state==="offline"?"status-offline":"status-checking");
badge.textContent=state.r2Status.state==="connected"?"Connected":state.r2Status.state==="offline"?"Unavailable":"Checking…";
$("r2StatusMessage").textContent=state.r2Status.message;
$("r2LastChecked").textContent=state.r2Status.lastChecked?"Last checked "+state.r2Status.lastChecked.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):"Not checked yet";
}
async function checkR2Connection(showToast=false){
const button=$("refreshR2Connection");if(button){button.disabled=true;button.textContent="Testing…"}
state.r2Status={...state.r2Status,state:"checking",message:"Checking the authenticated R2 binding."};renderR2Status();
try{
const data=await apiRequest("assets");
if(!data.connected||data.access!=="private")throw new Error("R2 binding did not report a private connected bucket.");
state.r2Status={state:"connected",message:"R2 is connected. Logo uploads are private and delivered through authenticated Pages Functions.",lastChecked:new Date()};
if(showToast)toast("R2 connection successful");
}catch(error){
state.r2Status={state:"offline",message:"R2 connection failed: "+(error.message||"binding unavailable"),lastChecked:new Date()};
if(showToast)toast("R2 connection failed: "+(error.message||"binding unavailable"));
}finally{renderR2Status();if(button){button.disabled=false;button.textContent="Test connection"}}
}
function renderAccessSync(){
const badge=$("accessSyncStatusBadge");if(!badge)return;
badge.className="integration-status "+(state.accessSyncState.state==="connected"?"status-connected":state.accessSyncState.state==="offline"?"status-offline":"status-checking");
badge.textContent=state.accessSyncState.state==="connected"?"Ready":state.accessSyncState.state==="setup"?"Setup needed":state.accessSyncState.state==="offline"?"Unavailable":"Checking…";
$("accessSyncStatusMessage").textContent=state.accessSyncState.message;
const hint=$("accessSyncSetupHint");hint.hidden=state.accessSyncState.state!=="setup";hint.replaceChildren();
if(state.accessSyncState.state==="setup"){
const p=document.createElement("div");p.textContent="To enable sync, create a Cloudflare API token with Account permission “Access: Apps and Policies Read”, scoped to this account. Add it in Pages Settings → Variables and Secrets as a Secret named ACCESS_SYNC_API_TOKEN. The account ID is already configured. Never paste the token into this page.";hint.appendChild(p);
const a=document.createElement("a");a.href="https://dash.cloudflare.com/4ed0b7cda99d43ce679d2aace4d3f525/api-tokens";a.target="_blank";a.rel="noopener noreferrer";a.textContent="Open Cloudflare dashboard ↗";a.style.display="inline-block";a.style.marginTop="7px";hint.appendChild(a);
}
const preview=$("accessSyncPreview");preview.hidden=state.accessSyncState.state!=="connected";
const list=$("accessSyncAppList");list.replaceChildren();
const visibleApps=state.accessSyncState.apps.filter(app=>state.accessSyncShowAll||app.existingServiceId==null);
if(state.accessSyncState.state==="connected"&&visibleApps.length===0){const empty=document.createElement("div");empty.className="access-sync-preview-empty";empty.textContent=state.accessSyncState.apps.length===0?"No supported, launcher-visible browser apps were found.":"All supported launcher apps are already synced. Turn on “Show all apps (including synced)” to review them.";list.appendChild(empty)}
for(const app of visibleApps){
const label=document.createElement("label");label.className="access-sync-app";
const check=document.createElement("input");check.type="checkbox";check.checked=state.accessSyncSelectedIds.has(app.accessId);check.dataset.accessApp=app.accessId;check.addEventListener("change",()=>{if(check.checked)state.accessSyncSelectedIds.add(app.accessId);else state.accessSyncSelectedIds.delete(app.accessId);updateAccessSelection()});
const main=document.createElement("span");main.className="access-sync-app-main";
const name=document.createElement("span");name.className="access-sync-app-title";name.textContent=app.name;
const url=document.createElement("span");url.className="access-sync-app-url";url.textContent=app.url;
const meta=document.createElement("span");meta.className="access-sync-app-meta";
const type=document.createElement("span");type.className="access-sync-app-state";type.textContent=app.type.replaceAll("_"," ");
const stateLabel=document.createElement("span");stateLabel.className="access-sync-app-stateLabel"+(app.matchType?" matched":"");stateLabel.textContent=app.matchType==="source"?"Already synced":app.matchType==="url"?"Link existing #"+app.existingServiceId:"New service";
meta.append(type,state);main.append(name,url,meta);label.append(check,main);list.appendChild(label);
}
const select=$("accessSyncCategory"),prior=select.value||"Access Launcher";select.replaceChildren();
for(const category of [...new Set([...state.accessSyncState.categories.map(c=>c.name),"Access Launcher"])].filter(Boolean).sort((a,b)=>a.localeCompare(b))){
const option=document.createElement("option");option.value=category;option.textContent=category;select.appendChild(option);
}
select.value=[...select.options].some(o=>o.value===prior)?prior:"Access Launcher";
$("refreshAccessApps").disabled=state.accessSyncState.state==="checking"||state.accessSyncBusy;
$("importAccessApps").disabled=state.accessSyncState.state!=="connected"||state.accessSyncBusy||state.accessSyncState.apps.length===0;
updateAccessSelection();
}
function updateAccessSelection(){
const missing=state.accessSyncState.apps.filter(app=>app.existingServiceId==null);
const selectedMissing=missing.filter(app=>state.accessSyncSelectedIds.has(app.accessId)).length;
const selected=state.accessSyncSelectedIds.size;
$("accessSyncSelectionCount").textContent=selected+" selected";
$("accessSyncSelectAll").checked=missing.length>0&&selectedMissing===missing.length;
$("accessSyncSelectAll").indeterminate=selectedMissing>0&&selectedMissing<missing.length;
$("importAccessApps").disabled=state.accessSyncState.state!=="connected"||state.accessSyncBusy||selected===0;
}
async function refreshAccessApps(showToast=false){
state.accessSyncState={...state.accessSyncState,state:"checking",message:"Loading visible web applications from Cloudflare Access."};renderAccessSync();
try{
const [data,categories]=await Promise.all([apiRequest("access-sync"),apiRequest("categories")]);
if(data.configured===false){
state.accessSyncState={state:"setup",message:data.message||"Cloudflare Access sync needs a read-only API token.",apps:[],lastChecked:new Date(),configured:false,categories:Array.isArray(categories)?categories:[]};
}else if(!Array.isArray(data.apps)){throw new Error(data.error||"Unexpected Access application response")}
else{
const previousSelected=state.accessSyncSelectedIds;
const missingCount=data.apps.filter(app=>app.existingServiceId==null).length;
const syncedCount=data.apps.length-missingCount;
state.accessSyncSelectedIds=new Set(data.apps.filter(app=>app.existingServiceId==null||previousSelected.has(app.accessId)).map(app=>app.accessId));
state.accessSyncState={state:"connected",message:missingCount+" not yet synced, "+syncedCount+" already synced. Showing "+(state.accessSyncShowAll?"all launcher apps.":"only missing apps by default."),apps:data.apps,lastChecked:new Date(),configured:true,categories:Array.isArray(categories)?categories:[]};
}
}catch(error){state.accessSyncState={...state.accessSyncState,state:"offline",message:error.message||"Could not load Cloudflare Access applications.",lastChecked:new Date()}}
renderAccessSync();if(showToast)toast(state.accessSyncState.state==="connected"?"Access application preview refreshed":state.accessSyncState.message);
}
async function importSelectedAccessApps(){
if(state.accessSyncBusy)return;
const ids=[...state.accessSyncSelectedIds];
if(!ids.length){toast("Select at least one Access application.");return}
state.accessSyncBusy=true;renderAccessSync();
try{
const result=await apiRequest("access-sync",{method:"POST",body:JSON.stringify({ids,category:$("accessSyncCategory").value||"Access Launcher"})});
await loadRemoteData();state.accessSyncSelectedIds=new Set();await refreshAccessApps(false);
toast("Access sync complete: "+result.imported+" added, "+result.updated+" updated, "+result.linkedExisting+" linked to existing services.");
}catch(error){toast("Access sync failed: "+(error.message||"request failed"));await refreshAccessApps(false)}
finally{state.accessSyncBusy=false;renderAccessSync()}
}
async function checkD1Connection(showToast=true){
const button=$("testD1Connection");if(button){button.disabled=true;button.textContent="Testing…"}
setD1Status("checking","Checking the authenticated API and shared D1 database.",{serviceCount:null,categoryCount:null,tagCount:null});
try{
const [remoteServices,remoteCategories,remoteSettings]=await Promise.all([apiRequest("services"),apiRequest("categories"),apiRequest("settings")]);
if(!Array.isArray(remoteServices)||!Array.isArray(remoteCategories)||!remoteSettings||typeof remoteSettings!=="object")throw new Error("Unexpected response from the database API");
state.apiConnected=true;state.apiError="";
setD1Status("connected","Connection verified. Catalog and portal settings are reachable in shared D1.",{serviceCount:remoteServices.length,categoryCount:remoteCategories.length,tagCount:countTagsInUse(remoteServices)});
if(showToast)toast("D1 connection successful");
}catch(error){
state.apiConnected=false;state.apiError=error.message||"Database API unavailable";
setD1Status("offline","Connection failed: "+state.apiError,{serviceCount:null,categoryCount:null,tagCount:null});
if(showToast)toast("D1 connection failed: "+state.apiError);
}finally{if(button){button.disabled=false;button.textContent="Test connection"}}
}

export { renderD1Status, setD1Status, countTagsInUse, addSafeExternalLink, renderPagesDeployment, checkPagesDeployment, renderR2Status, checkR2Connection, renderAccessSync, updateAccessSelection, refreshAccessApps, importSelectedAccessApps, checkD1Connection };
