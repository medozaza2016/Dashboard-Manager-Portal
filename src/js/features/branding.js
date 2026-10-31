/* Anchor Dashboard - portal name, logo, and favicon presentation. */
import { DEFAULT_PORTAL_FAVICON } from "../config.js";
import { $ } from "../core/dom.js";
import { svg } from "../icons.js";
import { state } from "../state.js";
import { assetUrl } from "./images.js";

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
const source=state.brandingLogoPreviewUrl||(logoKey&&state.apiConnected?assetUrl(logoKey):"");
updatePortalFavicon(source);
const sidebarImage=$("brandLogoImage");sidebarImage.hidden=!source;if(source)sidebarImage.src=source;else sidebarImage.removeAttribute("src");
$("brandLogoText").textContent=mark;$("brandLogoText").hidden=!!source||!mark;$("brandLogoGraphic").hidden=!!source||!!mark;
sidebarImage.onerror=()=>{sidebarImage.hidden=true;$("brandLogoText").hidden=!mark;$("brandLogoGraphic").hidden=!!mark};
const preview=$("settingsBrandPreview");if(preview)preview.textContent=name+(subtitle?" "+subtitle:"");
const pImage=$("settingsLogoImage");if(pImage){pImage.hidden=!source;if(source)pImage.src=source;else pImage.removeAttribute("src");pImage.onerror=()=>{pImage.hidden=true;$("settingsLogoText").hidden=!mark;$("settingsLogoGraphic").hidden=!!mark}}
const pText=$("settingsLogoText"),pGraphic=$("settingsLogoGraphic");if(pText&&pGraphic){pText.textContent=mark;pText.hidden=!!source||!mark;pGraphic.hidden=!!source||!!mark}
if($("removeBrandingLogo"))$("removeBrandingLogo").hidden=!logoKey&&!state.brandingLogoPreviewUrl;
}

export { taxonomyMessageIfAvailable, updatePortalFavicon, applyBranding };
