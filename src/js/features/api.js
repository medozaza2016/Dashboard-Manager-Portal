/* Anchor Dashboard - Pages Functions client: requests, payloads, remote hydration. */
import { $ } from "../core/dom.js";
import { state } from "../state.js";
import { countTagsInUse, setD1Status } from "./integrations.js";
import { categories, clearProfileData, restoreProfileCache, saveProfileCache, toast } from "./persistence.js";
import { render } from "./admin.js";

async function apiRequest(path,options={},profileOverride=state.currentProfile){
  const profileEndpoints = ["services","categories","tags","categories-manage","favorites-order"];
  const needsProfile = profileEndpoints.some(p => path === p || path.startsWith(p + "?") || path.startsWith(p + "&"));
  const profileParam = needsProfile ? `profile=${profileOverride}` : '';
  const separator = path.includes('?') ? '&' : '?';
  const fullPath = profileParam ? `${path}${separator}${profileParam}` : path;
  const response=await fetch("/api/"+fullPath,{credentials:"same-origin",...options,headers:{"content-type":"application/json",...(options.headers||{})}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body.error||("API request failed ("+response.status+")"));
  return body
}
function apiPayload(s){return {name:s.name,url:s.url,description:s.description||"",icon:s.icon||"🔧",logoKey:s.logoKey||null,category:s.category,tags:Array.isArray(s.tags)?s.tags:[],favorite:!!s.favorite}}
async function remoteSaveService(s,isNew=false){return apiRequest("services"+(!isNew&&s.id!=null?"?id="+encodeURIComponent(s.id):""),{method:isNew?"POST":"PUT",body:JSON.stringify(apiPayload(s))})}
async function runServiceAssetMigration(){
 if(!state.apiConnected||state.serviceAssetMigrationInFlight||state.serviceAssetMigrationCompleted)return;
 state.serviceAssetMigrationInFlight=true;
 try{
  const response=await fetch("/api/assets-migrate",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({confirm:true})});
  const result=await response.json().catch(()=>({}));
  if(response.status===409&&result.running){state.serviceAssetMigrationCompleted=true;return}
  if(result.success){
   state.serviceAssetMigrationCompleted=true;
   if(Number(result.migrated)>0){
    toast("Service images renamed and marked current: "+result.migrated);
    await loadRemoteData(state.currentProfile);
   }
  }else{
   toast("Service image cleanup needs attention: "+(result.message||result.error||"migration did not complete"));
  }
 }catch(error){
  toast("Service image cleanup could not run: "+(error.message||"request failed"));
 }finally{
  state.serviceAssetMigrationInFlight=false;
 }
}
async function loadRemoteData(profileId=state.currentProfile){
 const requestToken=++state.profileLoadToken;
 try{
  const [remoteServices,remoteSettings,remoteCategories,remoteFavoriteOrder]=await Promise.all([
   apiRequest("services",{},profileId),apiRequest("settings",{},profileId),apiRequest("categories",{},profileId),apiRequest("favorites-order",{},profileId)
  ]);
  if(profileId!==state.currentProfile||requestToken!==state.profileLoadToken)return false;
  if(!Array.isArray(remoteServices))throw new Error("Services endpoint did not return an array.");
  if(!Array.isArray(remoteCategories))throw new Error("Categories endpoint did not return an array.");
  if(!remoteSettings||typeof remoteSettings!=="object")throw new Error("Settings endpoint did not return an object.");if(!remoteFavoriteOrder||!Array.isArray(remoteFavoriteOrder.order))throw new Error("Favorites order endpoint did not return an ordered list.");
  state.services=remoteServices.map(s=>({...s,id:Number(s.id),favorite:!!s.favorite,tags:Array.isArray(s.tags)?s.tags:[]}));state.favoritesOrder=remoteFavoriteOrder.order.map(Number).filter(Number.isSafeInteger);
  state.categoryRecords=remoteCategories;state.nextId=Math.max(0,...state.services.map(s=>Number(s.id)||0))+1;
  state.branding={...state.branding,...(remoteSettings.branding||{})};state.persistedBrandingLogoKey=state.branding.logoKey||null;
  const remotePreferences=remoteSettings.preferences||{};state.preferences={...state.preferences,...remotePreferences,showCardDescriptions:typeof remotePreferences.showCardDescriptions==="boolean"?remotePreferences.showCardDescriptions:typeof remotePreferences.showSlimDescriptions==="boolean"?remotePreferences.showSlimDescriptions:!!state.preferences.showCardDescriptions};state.preferences.landingPage=state.preferences.landingPage==="all"?"all":"favorites";
   if(!state.localViewPreference){state.view=state.preferences.defaultView==="list"?"list":state.preferences.defaultView==="dots"?"dots":"cards";state.density=state.preferences.defaultView==="slim"?"slim":"regular"}
  
  state.dataProfileId=profileId;state.apiConnected=true;state.apiError="";
  setD1Status("connected","Connection verified. Catalog and portal settings are reachable in shared D1.",{serviceCount:state.services.length,categoryCount:remoteCategories.length,tagCount:countTagsInUse(state.services)});
  saveProfileCache(profileId);render();void runServiceAssetMigration();return true;
 }catch(error){
  if(profileId!==state.currentProfile||requestToken!==state.profileLoadToken)return false;
  state.apiConnected=false;state.apiError=error.message||"Database API unavailable";
  if(state.dataProfileId!==profileId)restoreProfileCache(profileId);
  if(state.dataProfileId!==profileId)clearProfileData(profileId);
  setD1Status("offline","Connection failed: "+state.apiError,{serviceCount:null,categoryCount:null,tagCount:null});
  render();toast("Database unavailable, showing only this profile's saved data");return false;
 }
}

export { apiRequest, apiPayload, remoteSaveService, runServiceAssetMigration, loadRemoteData };
