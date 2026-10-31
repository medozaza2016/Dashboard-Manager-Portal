/* Anchor Dashboard - portal name, logo, and favicon presentation. */
import { assetUrl } from "../core/asset-url.js";
import { DEFAULT_PORTAL_FAVICON } from "../config.js";
import { $ } from "../core/dom.js";
import { svg } from "../icons.js";
import { state } from "../state.js";
import { setImageSource } from "./image-cache.js";

function taxonomyMessageIfAvailable(_id,message){
const target=$("serviceOrderStatus");
if(target)target.textContent=message;
}
function updatePortalFavicon(source){
let link=$("portalFavicon");
if(!link){link=document.createElement("link");link.id="portalFavicon";link.rel="icon";document.head.appendChild(link)}
let href=DEFAULT_PORTAL_FAVICON;
if(source){
 href=source;
 if(!source.startsWith("blob:")&&source.startsWith("/api/assets?key="))href=source+"&favicon="+encodeURIComponent(state.branding.logoKey||"portal");
}
link.type=href.startsWith("data:image/svg+xml")?"image/svg+xml":"";
if(link.href!==new URL(href,location.href).href)link.href=href;
const status=$("brandingFaviconStatus");
if(status)status.textContent=source?"Browser tab icon: using the portal logo.":"Browser tab icon: using the default portal mark.";
}
function applyBranding(){
const name=state.branding.name||"Anchor",subtitle=state.branding.subtitle||"",mark=state.branding.logo||"",logoKey=state.branding.logoKey||"";
$("brandName").textContent=name;$("brandSubtitle").textContent=subtitle;$("brandSubtitle").hidden=!subtitle;document.title=name+(subtitle?" "+subtitle:"");
const previewSource=state.brandingLogoPreviewUrl||"";
const remoteKey=!previewSource&&logoKey&&state.apiConnected?logoKey:"";
const source=previewSource||(remoteKey?assetUrl(remoteKey):"");
updatePortalFavicon(source);
// Sidebar and Settings previews read the logo through the device cache, so the
// mark is not re-downloaded from R2 on every render.
const sidebarImage=$("brandLogoImage");
const restoreMark=()=>{if(!sidebarImage)return;sidebarImage.hidden=true;$("brandLogoText").hidden=!mark;$("brandLogoGraphic").hidden=!!mark};
setImageSource(sidebarImage,previewSource,remoteKey||null,restoreMark);
$("brandLogoText").textContent=mark;$("brandLogoText").hidden=!!source||!mark;$("brandLogoGraphic").hidden=!!source||!!mark;
const preview=$("settingsBrandPreview");if(preview)preview.textContent=name+(subtitle?" "+subtitle:"");
const pImage=$("settingsLogoImage");
if(pImage){setImageSource(pImage,previewSource,remoteKey||null)}
const pText=$("settingsLogoText"),pGraphic=$("settingsLogoGraphic");if(pText&&pGraphic){pText.textContent=mark;pText.hidden=!!source||!mark;pGraphic.hidden=!!source||!!mark}
if($("removeBrandingLogo"))$("removeBrandingLogo").hidden=!logoKey&&!state.brandingLogoPreviewUrl;
}

export { taxonomyMessageIfAvailable, updatePortalFavicon, applyBranding };
