/* Anchor Dashboard - asset URLs, logo uploads, and image sizing. */
import { $ } from "../core/dom.js";
import { state } from "../state.js";

function normalizeServiceImageSize(value){
 const size=Number(value);
 return value==null||!Number.isFinite(size)?34:Math.min(64,Math.max(20,Math.round(size/2)*2));
}
function applyServiceImageSize(value){
 document.documentElement.style.setProperty("--service-image-size",normalizeServiceImageSize(value)+"px");
}
function renderServiceImageSizePreview(value=state.preferences.serviceImageSize){
 const size=normalizeServiceImageSize(value);
 const range=$("serviceImageSizeSetting"),output=$("serviceImageSizeValue"),preview=$("serviceImageSizePreview");
 const image=$("serviceImageSizePreviewImage"),fallback=$("serviceImageSizePreviewFallback");
 if(range&&Number(range.value)!==size)range.value=String(size);
 if(output)output.textContent=size+" px";
 if(preview)preview.style.setProperty("--service-image-size",size+"px");
 const service=state.apiConnected?state.services.find(item=>item.logoKey):null;
 if(image&&fallback&&service){
   const source=assetUrl(service.logoKey);
   if(image.dataset.source!==source){image.dataset.source=source;image.src=source}
   image.hidden=false;fallback.hidden=true;
   image.onerror=()=>{image.hidden=true;fallback.hidden=false};
 }else if(image&&fallback){
   image.hidden=true;image.removeAttribute("src");delete image.dataset.source;fallback.hidden=false;
 }
}
function assetUrl(key){return "/api/assets?key="+encodeURIComponent(key)}
async function uploadImage(file,scope,options={}){
if(!state.apiConnected)throw new Error("Connect to the shared database before uploading a logo.");
const form=new FormData();form.append("scope",scope);form.append("file",file,file.name||"logo");
if(scope==="service"){form.append("serviceId",String(options.serviceId||""));form.append("profileId",String(options.profileId||state.currentProfile));form.append("originalName",file.name||"image")}
const response=await fetch("/api/assets",{method:"POST",credentials:"same-origin",body:form});
const body=await response.json().catch(()=>({}));
if(!response.ok)throw new Error(body.error||("Upload failed ("+response.status+")"));
return body;
}
async function deleteUploadedImage(key){
if(!key||!state.apiConnected)return false;
try{const response=await fetch("/api/assets?key="+encodeURIComponent(key),{method:"DELETE",credentials:"same-origin"});const body=await response.json().catch(()=>({}));return response.ok&&!!body.deleted}catch{return false}
}
async function cleanupPendingServiceLogos(keepKey=null){
for(const key of [...state.pendingServiceLogoKeys]){if(key===keepKey){state.pendingServiceLogoKeys.delete(key);continue}await deleteUploadedImage(key);state.pendingServiceLogoKeys.delete(key)}
}
function discardUncommittedBrandingLogo(){
state.brandingLogoUploadToken++;state.brandingLogoUploadBusy=false;if($("chooseBrandingLogo"))$("chooseBrandingLogo").disabled=false;
for(const key of [...state.pendingBrandingLogoKeys]){state.pendingBrandingLogoKeys.delete(key);void deleteUploadedImage(key)}
if(state.brandingLogoPreviewUrl){URL.revokeObjectURL(state.brandingLogoPreviewUrl);state.brandingLogoPreviewUrl=null}
state.branding.logoKey=state.persistedBrandingLogoKey;
}

export { normalizeServiceImageSize, applyServiceImageSize, renderServiceImageSizePreview, assetUrl, uploadImage, deleteUploadedImage, cleanupPendingServiceLogos, discardUncommittedBrandingLogo };
