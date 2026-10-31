/* Anchor Dashboard - localStorage cache, derived category list, and boot hydration. */
import { APP_VERSION } from "../config.js";
import { $, safe } from "../core/dom.js";
import { state } from "../state.js";

const categories=()=>["All",...new Set((state.apiConnected?state.categoryRecords.slice().sort((a,b)=>(Number(a.sortOrder??a.sort_order)||9999)-(Number(b.sortOrder??b.sort_order)||9999)).map(c=>c.name):state.services.map(s=>s.category)).filter(Boolean))];
function toast(msg){$("toast").textContent=msg;$("toast").style.display="block";setTimeout(()=>$("toast").style.display="none",2200)}
function profileCacheKey(profileId){return "anchor-profile-cache-v1-"+profileId}
function saveProfileCache(profileId=state.currentProfile){
 if(state.dataProfileId!==profileId)return;
 try{localStorage.setItem(profileCacheKey(profileId),JSON.stringify({profileId,services:state.services,favoritesOrder:state.favoritesOrder,categoryRecords:state.categoryRecords,taxonomyCategories:state.taxonomyCategories,tagRecords:state.tagRecords,nextId:state.nextId}))}catch{}
}
function clearProfileData(profileId){
 state.services=[];state.favoritesOrder=[];state.categoryRecords=[];state.taxonomyCategories=[];state.tagRecords=[];state.taxonomyLoaded=false;state.nextId=1;state.dataProfileId=profileId;
}
function restoreProfileCache(profileId){
 try{
  const cached=JSON.parse(localStorage.getItem(profileCacheKey(profileId))||localStorage.getItem("luxorit-profile-cache-v1-"+profileId));
  if(cached&&cached.profileId===profileId&&Array.isArray(cached.services)){
   state.services=cached.services.map((s,i)=>({...s,id:Number(s.id)||i+1,tags:Array.isArray(s.tags)?s.tags:[],favorite:!!s.favorite}));state.favoritesOrder=Array.isArray(cached.favoritesOrder)?cached.favoritesOrder.map(Number).filter(Number.isSafeInteger):[];
   state.categoryRecords=Array.isArray(cached.categoryRecords)?cached.categoryRecords:[];
   state.taxonomyCategories=Array.isArray(cached.taxonomyCategories)?cached.taxonomyCategories:[];
   state.tagRecords=Array.isArray(cached.tagRecords)?cached.tagRecords:[];
   state.taxonomyLoaded=Array.isArray(cached.taxonomyCategories)&&Array.isArray(cached.tagRecords);
   state.nextId=Math.max(0,...state.services.map(s=>Number(s.id)||0))+1;state.dataProfileId=profileId;return true;
  }
 }catch{}
 clearProfileData(profileId);return false;
}
function persist(){try{if(state.dataProfileId===state.currentProfile)saveProfileCache(state.currentProfile);localStorage.setItem("anchor-dashboard-v1",JSON.stringify({view:state.view,density:state.density,appVersion:APP_VERSION,branding:state.branding,preferences:state.preferences,currentProfile:state.currentProfile}))}catch{}}
function load(){
 let d=null;try{d=JSON.parse(localStorage.getItem("anchor-dashboard-v1")||localStorage.getItem("luxorit-portal-v1"))}catch{}if(d&&!localStorage.getItem("anchor-dashboard-v1")){try{localStorage.setItem("anchor-dashboard-v1",JSON.stringify(d))}catch{}}
 if(d){
  if(d.currentProfile===1||d.currentProfile===2)state.currentProfile=d.currentProfile;
  if(["list","cards","dots"].includes(d.view)){state.view=d.view;state.localViewPreference=true}if(d.density)state.density=d.density;
  if(d.branding)state.branding={...state.branding,...d.branding};if(d.preferences)state.preferences={...state.preferences,...d.preferences,showCardDescriptions:typeof d.preferences.showCardDescriptions==="boolean"?d.preferences.showCardDescriptions:typeof d.preferences.showSlimDescriptions==="boolean"?d.preferences.showSlimDescriptions:false};state.preferences.landingPage=state.preferences.landingPage==="all"?"all":"favorites";
  // The former shared services cache had no reliable profile owner, so never reuse it across profiles.
  restoreProfileCache(state.currentProfile);
 }else state.dataProfileId=state.currentProfile;
}

export { categories, toast, profileCacheKey, saveProfileCache, clearProfileData, restoreProfileCache, persist, load };
