/* Anchor Dashboard - profile switcher (Personal / Work). */
import { $ } from "../core/dom.js";
import { state } from "../state.js";
import { setD1Status } from "./integrations.js";
import { loadRemoteData } from "./api.js";
import { persist, restoreProfileCache, saveProfileCache } from "./persistence.js";
import { refreshTaxonomy } from "./taxonomy.js";
import { render } from "./admin.js";

function updateProfileUI(){
  const btn = $("profileToggle");
  if(!btn) return;
  btn.textContent = state.currentProfile === 1 ? "Personal" : "Work";
  btn.classList.toggle("active", state.currentProfile === 2);
}

function bindProfileSwitcher(){
  const btn=$("profileToggle");if(!btn)return;
  btn.onclick=async()=>{
    const previousProfile=state.currentProfile;
    saveProfileCache(previousProfile);
    state.currentProfile=previousProfile===1?2:1;
    // Invalidate requests from the previous profile before changing visible state.
    state.profileLoadToken++;state.taxonomyLoadToken++;
    updateProfileUI();$("search").value="";
    if($("categoryFilter"))$("categoryFilter").value="";
    if($("tagFilter"))$("tagFilter").value="";
    state.activeTag=null;state.sidebarTagsExpanded=false;state.sidebarCategoriesExpanded=false;state.reorderEnabled=false;
    state.current="All";state.page=state.preferences.landingPage==="all"?"all":"favorites";state.searchReturnPage=null;
    restoreProfileCache(state.currentProfile);
    persist();render();
    setD1Status("checking","Loading "+(state.currentProfile===1?"Personal":"Work")+" profile data…",{serviceCount:null,categoryCount:null,tagCount:null});
    const targetProfile=state.currentProfile;
    await loadRemoteData(targetProfile);
    if(targetProfile!==state.currentProfile)return;
    await refreshTaxonomy(false,targetProfile);
    if(targetProfile===state.currentProfile)render();
  };
}


export { updateProfileUI, bindProfileSwitcher };
